import { execFile } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const run = promisify(execFile);

export const dynamic = "force-dynamic";

/**
 * Projects are named, multi-folder workspaces.
 *
 * Reads come straight from the bind-mounted SQLite file — `hermes project`
 * inside the container costs ~2.3s per call, almost all of it CLI startup,
 * which made the panel feel broken. Writes still go through the CLI, since it
 * owns slug generation and folder bookkeeping.
 */

const DB_PATH = resolve(process.cwd(), "..", "data", "projects.db");

/** Names go into an argv array (never a shell), but keep them sane anyway. */
const NAME_RE = /^[\w][\w .,'&()-]{0,60}$/;
const SLUG_RE = /^[\w-]{1,64}$/;

type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  archived: number;
};

function openDb(readOnly: boolean) {
  const db = new DatabaseSync(DB_PATH, { readOnly });
  // The container writes this file too; wait rather than fail on a lock.
  db.exec("PRAGMA busy_timeout = 4000");
  return db;
}

function readProjects() {
  const db = openDb(true);
  try {
    const rows = db
      .prepare("SELECT id, slug, name, archived FROM projects ORDER BY created_at DESC")
      .all() as unknown as ProjectRow[];

    const meta = db
      .prepare("SELECT value FROM project_meta WHERE key = 'active_id'")
      .get() as { value?: string } | undefined;

    const folderCounts = new Map<string, number>();
    for (const r of db
      .prepare("SELECT project_id, COUNT(*) AS n FROM project_folders GROUP BY project_id")
      .all() as unknown as { project_id: string; n: number }[]) {
      folderCounts.set(r.project_id, Number(r.n));
    }

    return rows
      .filter((r) => !r.archived)
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        folders: folderCounts.get(r.id) ?? 0,
        active: r.id === meta?.value,
      }));
  } finally {
    db.close();
  }
}

async function hermes(args: string[]) {
  // `docker exec` rather than `docker compose exec` — no compose file to
  // parse, which is worth roughly a second.
  await run("docker", ["exec", "luna", "hermes", "project", ...args], {
    timeout: 30_000,
    maxBuffer: 1 << 20,
  });
}

export async function GET() {
  try {
    return NextResponse.json({ projects: readProjects() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not list projects.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: string;
      name?: string;
      description?: string;
      slug?: string;
    };
    const action = body.action ?? "create";

    if (action === "create") {
      const name = (body.name ?? "").trim();
      if (!NAME_RE.test(name)) {
        return NextResponse.json(
          { error: "Give the project a simple name." },
          { status: 400 },
        );
      }
      const args = ["create", name];
      const about = (body.description ?? "").trim();
      if (about) args.push("--description", about.slice(0, 200));
      await hermes(args);
      return NextResponse.json({ projects: readProjects() });
    }

    const slug = (body.slug ?? "").trim();
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json({ error: "Unknown project." }, { status: 400 });
    }

    // "archive" is the delete verb here — Hermes keeps the row so sessions
    // that referenced it don't dangle. `restore` brings it back.
    // `use`, `archive` and `restore` are each a single-row write — going
    // through the CLI cost ~1.8s of interpreter startup for an UPDATE. Verified
    // against the CLI: `use` only sets project_meta.active_id, `archive` only
    // sets projects.archived.
    if (action === "use" || action === "archive" || action === "restore") {
      const db = openDb(false);
      try {
        const row = db
          .prepare("SELECT id FROM projects WHERE slug = ?")
          .get(slug) as { id?: string } | undefined;
        if (!row?.id) {
          return NextResponse.json({ error: "Unknown project." }, { status: 404 });
        }

        if (action === "use") {
          db.prepare(
            "INSERT INTO project_meta (key, value) VALUES ('active_id', ?) " +
              "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          ).run(row.id);
        } else {
          db.prepare("UPDATE projects SET archived = ? WHERE id = ?").run(
            action === "archive" ? 1 : 0,
            row.id,
          );
        }
      } finally {
        db.close();
      }
      return NextResponse.json({ projects: readProjects() });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Project command failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

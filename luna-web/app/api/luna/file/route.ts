import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Luna's writable workspace — the only directory this route will serve. */
const ROOT = resolve(process.cwd(), "..", "workspace");

const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".csv": "text/csv",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json",
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".zip": "application/zip",
};

/**
 * Serves a file Luna produced in her workspace.
 *
 * Everything is resolved against ROOT and then checked to still be inside it,
 * so `../` sequences and absolute paths cannot escape into the host filesystem.
 */
export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get("path") ?? "";
    if (!raw) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    // Strip any leading workspace prefix Luna may have included.
    const rel = raw.replace(/^\/?(?:workspace\/)?/, "");
    const full = resolve(ROOT, rel);
    if (full !== ROOT && !full.startsWith(ROOT + sep)) {
      return NextResponse.json({ error: "Path is outside the workspace." }, { status: 403 });
    }

    const info = await stat(full).catch(() => null);
    if (!info?.isFile()) {
      return NextResponse.json({ error: "No such file." }, { status: 404 });
    }

    const name = basename(full);
    const type = TYPES[extname(full).toLowerCase()] ?? "application/octet-stream";
    const inline = type.startsWith("image/") || type === "application/pdf";

    const body = Readable.toWeb(createReadStream(full)) as ReadableStream;
    return new NextResponse(body, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(info.size),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name.replace(/"/g, "")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read that file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

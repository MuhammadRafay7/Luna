import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const run = promisify(execFile);

export const dynamic = "force-dynamic";

const COMPOSE = "/home/personal/Programing/luna/docker-compose.yml";

/**
 * Reads and writes Luna's default model.
 *
 * The gateway's `config.set` RPC only accepts its own UI keys ("mouse",
 * "statusbar"...) and rejects `model.default`, so this shells out to the CLI
 * inside the container, which is the supported path.
 */

/** Model ids are provider-prefixed slugs; reject anything that isn't. */
const MODEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]|\/(?=[A-Za-z0-9]))*$/;

async function hermes(args: string[]) {
  const { stdout } = await run(
    "docker",
    ["compose", "-f", COMPOSE, "exec", "-T", "luna", "hermes", ...args],
    { timeout: 30_000, maxBuffer: 1 << 20 },
  );
  return stdout;
}

export async function GET() {
  try {
    const out = await hermes(["config", "get", "model"]);
    const current = out.match(/^default:\s*(.+)$/m)?.[1]?.trim() ?? "";
    return NextResponse.json({ model: current });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read the model.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const { model } = (await req.json()) as { model?: string };
    const next = (model ?? "").trim();

    if (!next || next.length > 120 || !MODEL_RE.test(next)) {
      return NextResponse.json({ error: "That is not a valid model id." }, { status: 400 });
    }

    await hermes(["config", "set", "model.default", next]);

    // Read back rather than trusting the write.
    const out = await hermes(["config", "get", "model"]);
    const current = out.match(/^default:\s*(.+)$/m)?.[1]?.trim() ?? "";
    if (current !== next) {
      return NextResponse.json(
        { error: `Model did not change (still ${current || "unknown"}).` },
        { status: 502 },
      );
    }
    return NextResponse.json({ model: current });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not switch model.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

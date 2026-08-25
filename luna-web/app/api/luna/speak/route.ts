import { NextResponse } from "next/server";
import { hermesFetch } from "@/lib/hermes-auth";

export const dynamic = "force-dynamic";

/**
 * Synthesizes speech with Luna's configured TTS voice (Edge / en-US-AriaNeural
 * by default) and returns it as an audio data URL the browser can play.
 */
export async function POST(req: Request) {
  try {
    const { text } = (await req.json()) as { text?: string };
    const body = (text ?? "").trim();
    if (!body) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const res = await hermesFetch("/api/audio/speak", { text: body.slice(0, 4000) });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Speech synthesis failed (${res.status}).` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { data_url?: string };
    if (!data.data_url) {
      return NextResponse.json({ error: "No audio returned." }, { status: 502 });
    }
    return NextResponse.json({ dataUrl: data.data_url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { mintTicket, wsBase } from "@/lib/hermes-auth";

export const dynamic = "force-dynamic";

/**
 * Hands the browser a fresh single-use WS ticket plus the socket origin.
 * The dashboard password stays on the server.
 */
export async function POST() {
  try {
    const ticket = await mintTicket();
    return NextResponse.json({ ticket, wsBase: wsBase() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

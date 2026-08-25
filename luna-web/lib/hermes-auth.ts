import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Server-side credential handling for the Hermes dashboard backend.
 *
 * The dashboard password never reaches the browser. This module logs in,
 * holds the session cookie in server memory, and mints short-lived WS
 * tickets on demand. Tickets are single-use with a 30s TTL, so the browser
 * fetches a fresh one for every socket it opens.
 */

const HERMES_URL = process.env.HERMES_URL ?? "http://127.0.0.1:9119";

let cachedCookie: string | null = null;

function envFromFile(key: string): string | undefined {
  // luna-web lives inside the luna repo, so .env is one level up.
  for (const candidate of [
    resolve(process.cwd(), "..", ".env"),
    resolve(process.cwd(), ".env"),
  ]) {
    try {
      for (const line of readFileSync(candidate, "utf8").split("\n")) {
        if (line.startsWith(`${key}=`)) return line.slice(key.length + 1).trim();
      }
    } catch {
      // candidate missing — try the next one
    }
  }
  return undefined;
}

function credentials() {
  const username =
    process.env.HERMES_DASHBOARD_BASIC_AUTH_USERNAME ??
    envFromFile("HERMES_DASHBOARD_BASIC_AUTH_USERNAME");
  const password =
    process.env.HERMES_DASHBOARD_BASIC_AUTH_PASSWORD ??
    envFromFile("HERMES_DASHBOARD_BASIC_AUTH_PASSWORD");
  if (!username || !password) {
    throw new Error(
      "Dashboard credentials not found. Expected HERMES_DASHBOARD_BASIC_AUTH_USERNAME " +
        "and HERMES_DASHBOARD_BASIC_AUTH_PASSWORD in ../.env",
    );
  }
  return { username, password };
}

async function login(): Promise<string> {
  const { username, password } = credentials();
  const res = await fetch(`${HERMES_URL}/auth/password-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "basic", username, password }),
  });
  if (!res.ok) {
    throw new Error(`Hermes login failed (${res.status}). Is the container up?`);
  }
  const jar = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!jar) throw new Error("Hermes login returned no session cookie.");
  cachedCookie = jar;
  return jar;
}

/** Mint a single-use WS ticket, re-authenticating once if the session lapsed. */
export async function mintTicket(): Promise<string> {
  const attempt = async (cookie: string) =>
    fetch(`${HERMES_URL}/api/auth/ws-ticket`, {
      method: "POST",
      headers: { Cookie: cookie },
    });

  let res = await attempt(cachedCookie ?? (await login()));
  if (res.status === 401 || res.status === 403) {
    cachedCookie = null;
    res = await attempt(await login());
  }
  if (!res.ok) throw new Error(`Ticket mint failed (${res.status}).`);

  const { ticket } = (await res.json()) as { ticket: string };
  return ticket;
}

/** Browser-reachable WebSocket origin, derived from the HTTP base URL. */
export function wsBase(): string {
  return HERMES_URL.replace(/^http/, "ws");
}

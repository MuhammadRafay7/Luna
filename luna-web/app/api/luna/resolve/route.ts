import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/**
 * Resolves a free-text query to a concrete, playable YouTube video.
 *
 * Done server-side for two reasons: the browser can't fetch youtube.com
 * (CORS), and scraping needs a desktop User-Agent to get the full results
 * payload. No API key is involved — the YouTube Data API rejects the
 * project's key type, and this needs no credentials at all.
 */
async function resolveYouTube(query: string) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`YouTube search failed (${res.status}).`);

  const html = await res.text();

  const id = html.match(/"videoId":"([A-Za-z0-9_-]{11})"/)?.[1];
  if (!id) throw new Error("No video found for that search.");

  // Title sits in the first renderer block; it's a nicety, not required.
  const rawTitle = html.match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.){1,120})"/)?.[1];
  let title = "";
  try {
    title = rawTitle ? (JSON.parse(`"${rawTitle}"`) as string) : "";
  } catch {
    title = rawTitle ?? "";
  }

  return {
    url: `https://www.youtube.com/watch?v=${id}&autoplay=1`,
    title: title || query,
    videoId: id,
  };
}

/** Candidate TLDs, most likely first. */
const TLDS = ["com", "io", "co", "org", "net", "app", "dev", "ai"];

/**
 * Resolves a bare site name ("flipkart", "hacker news") to a real URL.
 *
 * Probes the obvious domains rather than scraping a search engine —
 * DuckDuckGo and Google both serve scrapers a shell page. If nothing answers,
 * falls back to a Google search for the name, so the user always lands
 * somewhere useful instead of nowhere.
 */
async function resolveSite(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "");

  if (slug) {
    for (const tld of TLDS) {
      const candidate = `https://${slug}.${tld}`;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(candidate, {
          method: "HEAD",
          redirect: "follow",
          signal: controller.signal,
          headers: { "User-Agent": UA },
        });
        clearTimeout(timer);
        if (res.status < 400) {
          return { url: res.url || candidate, title: name, resolved: "domain" };
        }
      } catch {
        // DNS miss, timeout, or TLS failure — try the next TLD.
      }
    }
  }

  return {
    url: `https://www.google.com/search?q=${encodeURIComponent(name)}`,
    title: name,
    resolved: "search",
  };
}

export async function POST(req: Request) {
  try {
    const { source, query } = (await req.json()) as {
      source?: string;
      query?: string;
    };

    const q = (query ?? "").trim();
    if (!q) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }
    if (source === "site") {
      return NextResponse.json(await resolveSite(q));
    }
    if (source !== "youtube") {
      return NextResponse.json(
        { error: `Cannot resolve source: ${source}` },
        { status: 400 },
      );
    }

    return NextResponse.json(await resolveYouTube(q));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Resolve failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

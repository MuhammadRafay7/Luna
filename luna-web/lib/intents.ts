/**
 * Client-side intent detection.
 *
 * Prompt instructions alone don't hold on a lite model — asked to "play baby
 * shark" it will happily run a web search and hand back a link. So the client
 * recognises the intent itself and resolves it, which also means the tab opens
 * inside the send click (a real user gesture) rather than from an async
 * callback a popup blocker would refuse.
 */

const PLAY =
  /^\s*(?:hey\s+)?(?:luna[,\s]+)?(?:please\s+)?(?:can you\s+)?(?:play|put on|stream)\s+(.{2,})$/i;

/** Trailing platform hints — dropped from the query, not required. */
const PLATFORM = /\s+(?:on|in|from|via)\s+(?:you-?tube|yt|music)\s*$/i;

/** Phrases that mean "search for it", not "start playing it". */
const NOT_PLAYBACK =
  /\b(?:playlist of|how to play|play(?:ing)? (?:store|games?)|rules|guitar|piano|chess)\b/i;

export type PlayIntent = { query: string };

export function detectPlayIntent(text: string): PlayIntent | null {
  if (NOT_PLAYBACK.test(text)) return null;

  const match = text.match(PLAY);
  if (!match) return null;

  const query = match[1].replace(PLATFORM, "").replace(/[.?!]+$/, "").trim();
  if (query.length < 2) return null;

  return { query };
}

/** Bare http(s) links in assistant prose, deduped, for fallback chips. */
export function extractLinks(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s)<>"'\]]+/g) ?? [];
  const seen = new Set<string>();
  for (const raw of found) {
    const url = raw.replace(/[.,;:]+$/, "");
    try {
      const u = new URL(url);
      if (u.protocol === "http:" || u.protocol === "https:") seen.add(u.toString());
    } catch {
      // Not a usable URL — skip it.
    }
  }
  return [...seen].slice(0, 4);
}

/* ---- Open intent ------------------------------------------------------- */

const OPEN =
  /^\s*(?:hey\s+)?(?:luna[,\s]+)?(?:please\s+)?(?:can you\s+)?(?:open|launch|go to|visit|take me to)\s+(.{2,})$/i;

/** Sites we can resolve from a bare name, no model involvement needed. */
const SITES: Record<string, string> = {
  google: "https://www.google.com",
  youtube: "https://www.youtube.com",
  yt: "https://www.youtube.com",
  facebook: "https://www.facebook.com",
  fb: "https://www.facebook.com",
  instagram: "https://www.instagram.com",
  insta: "https://www.instagram.com",
  whatsapp: "https://web.whatsapp.com",
  gmail: "https://mail.google.com",
  mail: "https://mail.google.com",
  drive: "https://drive.google.com",
  calendar: "https://calendar.google.com",
  maps: "https://www.google.com/maps",
  github: "https://github.com",
  x: "https://x.com",
  twitter: "https://x.com",
  linkedin: "https://www.linkedin.com",
  reddit: "https://www.reddit.com",
  netflix: "https://www.netflix.com",
  spotify: "https://open.spotify.com",
  amazon: "https://www.amazon.com",
  chatgpt: "https://chatgpt.com",
  gemini: "https://gemini.google.com",
  wikipedia: "https://en.wikipedia.org",
  translate: "https://translate.google.com",
};

export type OpenIntent = {
  /** Empty when the target still needs resolving server-side. */
  url: string;
  label: string;
  query?: string;
};

export function detectOpenIntent(text: string): OpenIntent | null {
  const match = text.match(OPEN);
  if (!match) return null;

  const target = match[1]
    .replace(/[.?!]+$/, "")
    .replace(/\s+(?:for me|please)$/i, "")
    .trim();

  // A spelled-out URL wins over the alias table.
  if (/^https?:\/\//i.test(target) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(target)) {
    const url = /^https?:\/\//i.test(target) ? target : `https://${target}`;
    try {
      const u = new URL(url);
      return { url: u.toString(), label: u.hostname.replace(/^www\./, "") };
    } catch {
      return null;
    }
  }

  const key = target.toLowerCase().replace(/\s+/g, "");
  const site = SITES[key];
  if (site) return { url: site, label: target };

  // Unknown name: don't guess a domain — probing TLDs lands on squatters
  // ("hackernews.co"). Let Luna resolve it; she handles misspellings and
  // knows that Hacker News lives at news.ycombinator.com.
  return null;
}

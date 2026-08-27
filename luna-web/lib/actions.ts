export type OpenUrlAction = {
  type: "open_url";
  url: string;
  label: string;
};

export type SearchAction = {
  type: "search";
  engine: SearchEngine;
  query: string;
  label: string;
};

export type PlayAction = {
  type: "play";
  source: "youtube";
  query: string;
  label: string;
};

export type FileAction = {
  type: "file";
  path: string;
  label: string;
};

export type LunaAction = OpenUrlAction | SearchAction | PlayAction | FileAction;

export type SearchEngine = keyof typeof SEARCH_URLS;

const ACTION_BLOCK_REGEX = /```(?:luna-action|json:action)\s*([\s\S]*?)\s*```/g;

/** Query templates for the sites worth searching directly. */
const SEARCH_URLS = {
  google: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  youtube: (q: string) =>
    `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  maps: (q: string) => `https://www.google.com/maps/search/${encodeURIComponent(q)}`,
  images: (q: string) =>
    `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`,
  spotify: (q: string) => `https://open.spotify.com/search/${encodeURIComponent(q)}`,
  amazon: (q: string) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
  github: (q: string) => `https://github.com/search?q=${encodeURIComponent(q)}`,
  wikipedia: (q: string) =>
    `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`,
  x: (q: string) => `https://x.com/search?q=${encodeURIComponent(q)}`,
  reddit: (q: string) => `https://www.reddit.com/search/?q=${encodeURIComponent(q)}`,
} as const;

/** Bare site names Luna may use instead of spelling out a full URL. */
const SITES: Record<string, string> = {
  facebook: "https://www.facebook.com",
  instagram: "https://www.instagram.com",
  whatsapp: "https://web.whatsapp.com",
  youtube: "https://www.youtube.com",
  google: "https://www.google.com",
  gmail: "https://mail.google.com",
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
  wikipedia: "https://en.wikipedia.org",
};

/**
 * Validates whether a URL is a safe HTTP or HTTPS web URL.
 */
export function isValidWebUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Validates one parsed JSON payload into a typed action, or null. */
function toAction(parsed: unknown): LunaAction | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const type = String(o.type ?? "").toLowerCase();
  const label = typeof o.label === "string" ? o.label.trim() : "";

  if (type === "open_url" || type === "open") {
    // Accept a full URL, or a bare site name Luna didn't spell out.
    const site = String(o.site ?? "")
      .toLowerCase()
      .trim();
    const candidate =
      (typeof o.url === "string" && o.url.trim()) || SITES[site] || "";
    if (!candidate || !isValidWebUrl(candidate)) return null;
    return {
      type: "open_url",
      url: candidate,
      label:
        label ||
        (site ? titleCase(site) : new URL(candidate).hostname.replace(/^www\./, "")),
    };
  }

  if (type === "search") {
    const engine = String(o.engine ?? "google").toLowerCase();
    const query = String(o.query ?? "").trim();
    if (!query || !(engine in SEARCH_URLS)) return null;
    return {
      type: "search",
      engine: engine as SearchEngine,
      query,
      label: label || `${titleCase(engine)}: ${query}`,
    };
  }

  if (type === "file" || type === "download") {
    const path = String(o.path ?? o.file ?? "").trim();
    // Workspace-relative only; the API route rejects escapes, but no point
    // rendering a chip we know will fail.
    if (!path || path.includes("..")) return null;
    return {
      type: "file",
      path: path.replace(/^\/?(?:workspace\/)?/, ""),
      label: label || path.split("/").pop() || path,
    };
  }

  if (type === "play") {
    const source = String(o.source ?? "youtube").toLowerCase();
    const query = String(o.query ?? "").trim();
    // Only YouTube can be resolved to a concrete playable URL today.
    if (!query || source !== "youtube") return null;
    return { type: "play", source: "youtube", query, label: label || query };
  }

  return null;
}

/**
 * Parses all structured `luna-action` blocks out of raw message text,
 * validates their payloads, and returns the list of actions along with
 * the cleaned text for Markdown rendering.
 */
export function parseActions(rawText: string): {
  actions: LunaAction[];
  cleanText: string;
} {
  if (!rawText) return { actions: [], cleanText: "" };

  const actions: LunaAction[] = [];
  const cleanText = rawText.replace(ACTION_BLOCK_REGEX, (_, jsonContent: string) => {
    try {
      const parsed = JSON.parse(jsonContent.trim());
      // A block may carry one action or an array of them.
      for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
        const action = toAction(entry);
        if (action) actions.push(action);
      }
    } catch {
      // Malformed JSON is safely ignored
    }
    return ""; // Strip from rendered text
  });

  return { actions, cleanText: cleanText.trim() };
}

/**
 * Strips all `luna-action` blocks from text (useful for TTS so voice mode
 * doesn't read JSON or markup aloud).
 */
export function stripActions(text: string): string {
  if (!text) return "";
  return text.replace(ACTION_BLOCK_REGEX, "").trim();
}

/**
 * The URL an action should open.
 *
 * `open_url` and `search` resolve synchronously from templates. `play` needs
 * a server round-trip: the query is resolved to a concrete video id so the
 * video plays directly instead of dumping the user on a results page.
 */
export async function resolveActionUrl(action: LunaAction): Promise<string> {
  if (action.type === "open_url") return action.url;
  if (action.type === "search") return SEARCH_URLS[action.engine](action.query);
  if (action.type === "file") {
    return `/api/luna/file?path=${encodeURIComponent(action.path)}`;
  }

  const res = await fetch("/api/luna/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: action.source, query: action.query }),
  });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({ error: "" }))) as {
      error?: string;
    };
    throw new Error(error || "Could not find that video.");
  }
  const { url } = (await res.json()) as { url: string };
  if (!isValidWebUrl(url)) throw new Error("Resolver returned an unusable URL.");
  return url;
}

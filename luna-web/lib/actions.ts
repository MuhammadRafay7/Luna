export type OpenUrlAction = {
  type: "open_url";
  url: string;
  label: string;
};

export type LunaAction = OpenUrlAction;

const ACTION_BLOCK_REGEX = /```(?:luna-action|json:action)\s*([\s\S]*?)\s*```/g;

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
      if (
        parsed &&
        parsed.type === "open_url" &&
        typeof parsed.url === "string" &&
        isValidWebUrl(parsed.url)
      ) {
        actions.push({
          type: "open_url",
          url: parsed.url,
          label:
            typeof parsed.label === "string" && parsed.label.trim()
              ? parsed.label.trim()
              : new URL(parsed.url).hostname,
        });
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

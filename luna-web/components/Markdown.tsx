"use client";

import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

/**
 * Renders model output as markdown. Everything is sanitized before it
 * reaches the DOM — Luna's replies can quote arbitrary web and file content.
 */
export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    if (!text) return "";
    const raw = marked.parse(text, { async: false }) as string;
    // Guard for SSR, where DOMPurify has no window to work against.
    if (typeof window === "undefined") return "";
    return DOMPurify.sanitize(raw, { ADD_ATTR: ["target", "rel"] });
  }, [text]);

  return (
    <div
      className="luna-prose break-words"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

"use client";

import { useState } from "react";
import type { ToolCall } from "@/lib/types";

const ICONS: Record<string, string> = {
  terminal: "▸",
  file: "◈",
  web: "◎",
  browser: "◍",
  vision: "◉",
  image_gen: "◆",
  memory: "❖",
  code_execution: "⌘",
};

function icon(name: string) {
  for (const key of Object.keys(ICONS)) if (name.includes(key)) return ICONS[key];
  return "◇";
}

/**
 * One tool invocation, collapsed to a single line until clicked.
 * Mirrors how the terminal TUI shows tool activity inline with the reply.
 */
export function ToolCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(tool.output || tool.error || Object.keys(tool.args).length);

  const tint =
    tool.status === "error"
      ? "var(--danger)"
      : tool.status === "running"
        ? "var(--tool)"
        : "var(--text-muted)";

  return (
    <div
      className="rounded-lg border text-sm"
      style={{ borderColor: "var(--border)", background: "var(--bg-sunken)" }}
    >
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
        style={{ cursor: hasDetail ? "pointer" : "default" }}
      >
        <span
          aria-hidden
          className={tool.status === "running" ? "luna-dot" : ""}
          style={{ color: tint, fontSize: "0.9em" }}
        >
          {icon(tool.name)}
        </span>

        <span className="font-medium" style={{ color: "var(--text)" }}>
          {tool.name}
        </span>

        {tool.context && (
          <span
            className="truncate font-mono text-xs"
            style={{ color: "var(--text-muted)", maxWidth: "28rem" }}
          >
            {tool.context}
          </span>
        )}

        <span className="ml-auto flex items-center gap-2 text-xs" style={{ color: "var(--text-faint)" }}>
          {tool.status === "running" && <span>running…</span>}
          {tool.durationS != null && <span>{tool.durationS.toFixed(2)}s</span>}
          {hasDetail && <span aria-hidden>{open ? "▾" : "▸"}</span>}
        </span>
      </button>

      {open && hasDetail && (
        <div
          className="border-t px-3 py-2.5 text-xs"
          style={{ borderColor: "var(--border)" }}
        >
          {Object.keys(tool.args).length > 0 && (
            <pre
              className="mb-2 overflow-x-auto font-mono"
              style={{ color: "var(--text-muted)" }}
            >
              {JSON.stringify(tool.args, null, 2)}
            </pre>
          )}
          {tool.output && (
            <pre
              className="overflow-x-auto whitespace-pre-wrap font-mono"
              style={{ color: "var(--text)" }}
            >
              {tool.output}
            </pre>
          )}
          {tool.error && (
            <pre
              className="overflow-x-auto whitespace-pre-wrap font-mono"
              style={{ color: "var(--danger)" }}
            >
              {tool.error}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

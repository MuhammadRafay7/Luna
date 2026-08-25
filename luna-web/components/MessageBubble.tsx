"use client";

import { useState } from "react";
import type { Message } from "@/lib/types";
import { Markdown } from "./Markdown";
import { ToolCard } from "./ToolCard";

function LunaMark() {
  return (
    <div
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
      aria-hidden
    >
      ☾
    </div>
  );
}

export function MessageBubble({ message }: { message: Message }) {
  const [showReasoning, setShowReasoning] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] space-y-2">
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2">
              {message.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt="Attached"
                  className="max-h-48 rounded-xl border object-cover"
                  style={{ borderColor: "var(--border)" }}
                />
              ))}
            </div>
          )}
          {message.text && (
            <div
              className="rounded-2xl px-4 py-2.5 leading-relaxed whitespace-pre-wrap break-words"
              style={{ background: "var(--bubble-user)", color: "var(--text)" }}
            >
              {message.text}
            </div>
          )}
        </div>
      </div>
    );
  }

  const empty =
    !message.text && !message.error && message.tools.length === 0 && !message.reasoning;

  return (
    <div className="flex gap-3">
      <LunaMark />
      <div className="min-w-0 flex-1 space-y-2.5 pt-0.5">
        {message.reasoning && (
          <div>
            <button
              type="button"
              onClick={() => setShowReasoning((v) => !v)}
              className="text-xs"
              style={{ color: "var(--text-faint)" }}
            >
              {showReasoning ? "▾" : "▸"} thinking
            </button>
            {showReasoning && (
              <div
                className="mt-1.5 rounded-lg border px-3 py-2 text-xs whitespace-pre-wrap"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--bg-sunken)",
                  color: "var(--text-muted)",
                }}
              >
                {message.reasoning}
              </div>
            )}
          </div>
        )}

        {message.tools.length > 0 && (
          <div className="space-y-1.5">
            {message.tools.map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
          </div>
        )}

        {message.text && (
          <div className={message.streaming ? "luna-caret" : undefined}>
            <Markdown text={message.text} />
          </div>
        )}

        {empty && message.streaming && (
          <div className="flex gap-1 py-1" aria-label="Luna is thinking">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="luna-dot size-1.5 rounded-full"
                style={{ background: "var(--text-faint)", animationDelay: `${i * 0.18}s` }}
              />
            ))}
          </div>
        )}

        {message.error && (
          <div
            className="rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--danger)",
              color: "var(--danger)",
              background: "var(--bg-sunken)",
            }}
          >
            {message.error}
          </div>
        )}

        {message.usage?.contextPercent != null && !message.streaming && (
          <div className="text-xs" style={{ color: "var(--text-faint)" }}>
            {message.usage.model} · {message.usage.contextPercent}% context
            {message.usage.total ? ` · ${message.usage.total.toLocaleString()} tokens` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

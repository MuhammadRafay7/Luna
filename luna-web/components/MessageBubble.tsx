"use client";

import { useMemo, useState } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Sparkles,
} from "lucide-react";
import type { Message } from "@/lib/types";
import { parseActions } from "@/lib/actions";
import { showToast } from "@/lib/use-toast";
import { Markdown } from "./Markdown";
import { ToolCard } from "./ToolCard";
import { ActionChip } from "./ActionChip";
import { LunaAvatar } from "./LunaLogo";

function LunaMark() {
  return <LunaAvatar size={28} />;
}

export function MessageBubble({ message }: { message: Message }) {
  const [showReasoning, setShowReasoning] = useState(false);
  const [copied, setCopied] = useState(false);

  const { actions, cleanText } = useMemo(
    () => parseActions(message.text),
    [message.text],
  );

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(cleanText || message.text);
      setCopied(true);
      showToast("Message copied to clipboard", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Failed to copy message", "error");
    }
  };

  if (message.role === "user") {
    return (
      <div className="group flex justify-end">
        <div className="relative max-w-[85%] space-y-2">
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2">
              {message.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt="Attachment"
                  className="max-h-48 rounded-2xl border object-cover shadow-sm"
                  style={{ borderColor: "var(--border)" }}
                />
              ))}
            </div>
          )}
          {message.text && (
            <div
              className="rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm"
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
    !cleanText && !message.error && message.tools.length === 0 && !message.reasoning;

  return (
    <div className="group relative flex gap-3">
      <LunaMark />

      <div className="min-w-0 flex-1 space-y-3 pt-0.5">
        {/* Thinking / Reasoning section */}
        {message.reasoning && (
          <div>
            <button
              type="button"
              onClick={() => setShowReasoning((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: "var(--text-muted)" }}
            >
              <Brain className="size-3.5 text-amber-500" />
              <span>Thinking process</span>
              {showReasoning ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
            </button>
            {showReasoning && (
              <div
                className="mt-2 rounded-xl border p-3 text-xs leading-relaxed whitespace-pre-wrap font-mono"
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

        {/* Executed Tools */}
        {message.tools.length > 0 && (
          <div className="space-y-1.5">
            {message.tools.map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
          </div>
        )}

        {/* Action Chips */}
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1 pb-1">
            {actions.map((act, i) => (
              <ActionChip key={i} action={act} />
            ))}
          </div>
        )}

        {/* Assistant Response Text */}
        {cleanText && (
          <div
            className={`text-sm leading-relaxed ${
              message.streaming ? "luna-caret" : ""
            }`}
          >
            <Markdown text={cleanText} />
          </div>
        )}

        {/* Streaming Skeleton Dots */}
        {empty && message.streaming && (
          <div className="flex items-center gap-1.5 py-1" aria-label="Luna is thinking">
            <Sparkles className="size-3.5 animate-spin text-amber-500" />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Luna is thinking…
            </span>
          </div>
        )}

        {/* Error Notification */}
        {message.error && (
          <div
            className="rounded-xl border px-3.5 py-2.5 text-xs"
            style={{
              borderColor: "var(--danger)",
              color: "var(--danger)",
              background: "var(--bg-sunken)",
            }}
          >
            {message.error}
          </div>
        )}

        {/* Bottom meta + message hover actions */}
        <div className="flex items-center justify-between pt-1">
          {message.usage?.contextPercent != null && !message.streaming ? (
            <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
              {message.usage.model} · {message.usage.contextPercent}% context
              {message.usage.total
                ? ` · ${message.usage.total.toLocaleString()} tokens`
                : ""}
            </div>
          ) : (
            <div />
          )}

          {/* Quick Copy Action */}
          {!message.streaming && (cleanText || message.text) && (
            <div className="opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={copyToClipboard}
                title="Copy response"
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: "var(--text-muted)" }}
              >
                {copied ? (
                  <Check className="size-3 text-emerald-500" />
                ) : (
                  <Copy className="size-3" />
                )}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

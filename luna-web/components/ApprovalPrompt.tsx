"use client";

import { useEffect } from "react";
import { ShieldAlert } from "lucide-react";
import type { ApprovalRequest } from "@/lib/types";

const LABELS: Record<string, string> = {
  once: "Allow once",
  session: "Allow this session",
  always: "Always allow",
  deny: "Don't run it",
};

/**
 * Blocks on a dangerous command until the user decides.
 *
 * Hermes' guard has already parked the agent thread waiting for an answer, so
 * this must be impossible to miss and impossible to dismiss by accident:
 * clicking the backdrop and pressing Escape both deny rather than close.
 */
export function ApprovalPrompt({
  request,
  onRespond,
}: {
  request: ApprovalRequest;
  onRespond: (choice: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onRespond("deny");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onRespond]);

  // Deny first: the safe option should be the one you reach for.
  const ordered = ["deny", "once", "session", "always"].filter((c) =>
    request.choices.includes(c),
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 backdrop-blur-md"
      style={{ background: "rgb(0 0 0 / 0.6)" }}
      onClick={() => onRespond("deny")}
      role="alertdialog"
      aria-modal="true"
      aria-label="Confirm a dangerous action"
    >
      <div
        className="luna-glass-strong luna-rise w-full max-w-lg overflow-hidden rounded-3xl"
        style={{ borderColor: "var(--danger)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <span
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in srgb, var(--danger) 18%, transparent)",
              color: "var(--danger)",
            }}
          >
            <ShieldAlert className="size-4.5" />
          </span>

          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Luna wants to run something risky</h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {request.rule
                ? `Flagged as: ${request.rule}`
                : "This was flagged as potentially destructive."}
            </p>
          </div>
        </div>

        <pre
          className="mx-5 mt-3.5 overflow-x-auto rounded-xl px-3.5 py-3 font-mono text-xs"
          style={{
            background: "var(--bg-sunken)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        >
          {request.command}
        </pre>

        {request.detail && (
          <p
            className="mx-5 mt-2 text-[11px] leading-relaxed"
            style={{ color: "var(--text-faint)" }}
          >
            {request.detail}
          </p>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2 px-5 pb-5">
          {ordered.map((choice) => {
            const isDeny = choice === "deny";
            return (
              <button
                key={choice}
                type="button"
                autoFocus={isDeny}
                onClick={() => onRespond(choice)}
                className="luna-pill px-4 py-2 text-xs font-semibold transition-transform hover:-translate-y-px"
                style={
                  isDeny
                    ? { background: "var(--danger)", color: "#fff" }
                    : {
                        background: "var(--bg-hover)",
                        color: "var(--text-muted)",
                      }
                }
              >
                {LABELS[choice] ?? choice}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

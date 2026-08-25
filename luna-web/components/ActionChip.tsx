"use client";

import { ExternalLink, Globe } from "lucide-react";
import type { LunaAction } from "@/lib/actions";

export function ActionChip({ action }: { action: LunaAction }) {
  const handleClick = () => {
    if (action.type === "open_url") {
      window.open(action.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Open ${action.url}`}
      className="group inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98]"
      style={{
        background: "var(--bg-raised)",
        borderColor: "var(--border-strong)",
        color: "var(--text)",
        boxShadow: "var(--shadow)",
      }}
    >
      <span
        className="flex size-5 items-center justify-center rounded-md transition-colors group-hover:scale-105"
        style={{
          background: "var(--accent-soft)",
          color: "var(--accent)",
        }}
      >
        <Globe className="size-3" />
      </span>

      <span className="font-medium tracking-tight">Open {action.label}</span>

      <ExternalLink className="size-3 opacity-50 transition-all duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
    </button>
  );
}

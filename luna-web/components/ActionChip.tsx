"use client";

import { useState } from "react";
import { Download, ExternalLink, Globe, Loader2, Play, Search } from "lucide-react";
import { resolveActionUrl, type LunaAction } from "@/lib/actions";
import { showToast } from "@/lib/use-toast";

/** Icon and verb per action kind. */
function present(action: LunaAction) {
  switch (action.type) {
    case "play":
      return { Icon: Play, verb: "Play" };
    case "search":
      return { Icon: Search, verb: "Search" };
    case "file":
      return { Icon: Download, verb: "Open" };
    default:
      return { Icon: Globe, verb: "Open" };
  }
}

export function ActionChip({ action }: { action: LunaAction }) {
  const [busy, setBusy] = useState(false);
  const { Icon, verb } = present(action);

  const handleClick = async () => {
    if (busy) return;

    // `open_url` and `search` resolve synchronously, so opening inside the
    // click keeps the popup blocker happy. `play` needs a server round-trip
    // first, so open the tab now and point it at the video once resolved —
    // a window opened later, outside the gesture, would be blocked.
    if (action.type !== "play") {
      try {
        window.open(await resolveActionUrl(action), "_blank", "noopener,noreferrer");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Could not open that.", "error");
      }
      return;
    }

    setBusy(true);
    try {
      const url = await resolveActionUrl(action);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not find that video.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title={
        action.type === "open_url" ? `Open ${action.url}` : `${verb} ${action.label}`
      }
      className="group inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] disabled:opacity-60"
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
        {busy ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Icon className="size-3" />
        )}
      </span>

      <span className="max-w-64 truncate font-medium tracking-tight">
        {busy ? "Finding…" : `${verb} ${action.label}`}
      </span>

      <ExternalLink className="size-3 opacity-50 transition-all duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
    </button>
  );
}

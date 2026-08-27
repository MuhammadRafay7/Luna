"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Sun,
  X,
} from "lucide-react";
import type { SessionSummary } from "@/lib/types";

type Props = {
  open: boolean;
  sessions: SessionSummary[];
  activeId: string | null;
  onClose: () => void;
  onNewChat: () => void;
  onOpenSession: (id: string) => void;
  onVoiceMode: () => void;
  onToggleTheme: () => void;
};

export function CommandPalette({
  open,
  sessions,
  activeId,
  onClose,
  onNewChat,
  onOpenSession,
  onVoiceMode,
  onToggleTheme,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();

    const actions = [
      {
        id: "action-new-chat",
        type: "action" as const,
        label: "New conversation",
        sublabel: "Start a fresh session with Luna",
        icon: <Plus className="size-4" />,
        run: () => {
          onNewChat();
          onClose();
        },
      },
      {
        id: "action-voice",
        type: "action" as const,
        label: "Voice mode",
        sublabel: "Start hands-free audio conversation",
        icon: <AudioLines className="size-4" />,
        run: () => {
          onVoiceMode();
          onClose();
        },
      },
      {
        id: "action-theme",
        type: "action" as const,
        label: "Toggle theme",
        sublabel: "Switch between dark and light mode",
        icon: <Sun className="size-4" />,
        run: () => {
          onToggleTheme();
          onClose();
        },
      },
    ];

    const sessionItems = sessions.map((s) => ({
      id: `session-${s.id}`,
      type: "session" as const,
      sessionId: s.id,
      label: s.title || "Untitled chat",
      sublabel: s.id === activeId ? "Current conversation" : undefined,
      icon: <MessageSquare className="size-4" />,
      run: () => {
        onOpenSession(s.id);
        onClose();
      },
    }));

    const all = [...actions, ...sessionItems];
    if (!q) return all;

    return all.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.sublabel && item.sublabel.toLowerCase().includes(q)),
    );
  }, [
    query,
    sessions,
    activeId,
    onNewChat,
    onClose,
    onVoiceMode,
    onToggleTheme,
    onOpenSession,
  ]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation inside the palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (items.length || 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + items.length) % (items.length || 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[selectedIndex]) {
        items[selectedIndex].run();
      }
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh] backdrop-blur-md"
      style={{ background: "rgb(0 0 0 / 0.45)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="luna-rise luna-glass-strong luna-edge-lit w-full max-w-xl overflow-hidden rounded-3xl"
        style={{
          boxShadow: "0 30px 80px -20px rgb(0 0 0 / 0.65)",
        }}
      >
        {/* Search header */}
        <div
          className="flex items-center gap-3 border-b px-4 py-3.5"
          style={{ borderColor: "color-mix(in srgb, var(--border) 70%, transparent)" }}
        >
          <Search className="size-4.5 shrink-0" style={{ color: "var(--accent)" }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search conversations…"
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: "var(--text)" }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="flex size-6 items-center justify-center rounded-md opacity-40 hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Results list */}
        <div className="max-h-80 overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs" style={{ color: "var(--text-faint)" }}>
              No matches found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <ul className="space-y-0.5">
              {items.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={item.run}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`luna-pill flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm ${
                        isSelected ? "luna-pill-active" : ""
                      }`}
                      style={{ color: "var(--text)" }}
                    >
                      <div
                        className="flex size-7 items-center justify-center rounded-full transition-colors"
                        style={{
                          background: isSelected
                            ? "var(--grad-brand)"
                            : "color-mix(in srgb, var(--bg-hover) 80%, transparent)",
                          color: isSelected ? "var(--accent-text)" : "var(--text-muted)",
                        }}
                      >
                        {item.icon}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{item.label}</div>
                        {item.sublabel && (
                          <div
                            className="truncate text-xs"
                            style={{ color: "var(--text-faint)" }}
                          >
                            {item.sublabel}
                          </div>
                        )}
                      </div>

                      {isSelected && (
                        <span
                          className="font-mono text-[10px] tracking-wider uppercase opacity-50"
                          style={{ color: "var(--text-faint)" }}
                        >
                          ↵ select
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div
          className="flex items-center justify-between border-t px-4 py-2 text-[11px]"
          style={{ borderColor: "var(--border)", color: "var(--text-faint)" }}
        >
          <div className="flex items-center gap-2">
            <span>↑↓ to navigate</span>
            <span>·</span>
            <span>↵ to select</span>
            <span>·</span>
            <span>esc to dismiss</span>
          </div>
          <span className="font-medium">Luna Commands</span>
        </div>
      </div>
    </div>
  );
}

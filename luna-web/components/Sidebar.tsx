"use client";

import { useEffect, useState } from "react";
import {
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sun,
  Trash2,
} from "lucide-react";
import type { SessionSummary } from "@/lib/types";
import type { ConnectionStatus } from "@/lib/luna-client";
import { LunaLogo } from "./LunaLogo";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  open: "Connected",
  closed: "Disconnected",
  error: "Error",
};

function relative(ts?: number) {
  if (!ts) return "";
  const secs = Date.now() / 1000 - ts;
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function bucket(ts?: number): string {
  if (!ts) return "Earlier";
  const days = (Date.now() / 1000 - ts) / 86400;
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return "This week";
  return "Earlier";
}

export function Sidebar({
  open,
  collapsed,
  sessions,
  activeId,
  status,
  onNew,
  onOpen,
  onDelete,
  onClose,
  onToggleCollapse,
}: {
  open: boolean;
  collapsed: boolean;
  sessions: SessionSummary[];
  activeId: string | null;
  status: ConnectionStatus;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onToggleCollapse: () => void;
}) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("luna-theme");
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      // Ignored
    }
  }, []);

  const toggleTheme = () => {
    const current =
      theme ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light");
    const next = current === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("luna-theme", next);
    } catch {
      // Ignored
    }
  };

  const dot =
    status === "open"
      ? "var(--ok)"
      : status === "connecting"
        ? "var(--tool)"
        : "var(--danger)";

  const groups = ["Today", "Yesterday", "This week", "Earlier"].map((name) => ({
    name,
    items: sessions.filter((s) => bucket(s.updatedAt) === name),
  }));

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 backdrop-blur-xs md:hidden"
          style={{ background: "rgb(0 0 0 / 0.4)" }}
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r transition-all duration-200 md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          width: collapsed ? 64 : 280,
          borderColor: "var(--border)",
          background: "var(--bg-sunken)",
        }}
      >
        {/* Brand Header */}
        <div
          className={`flex items-center gap-2.5 py-4 ${
            collapsed ? "justify-center px-0" : "px-4"
          }`}
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-xl transition-transform hover:scale-105">
            <LunaLogo size={26} glow />
          </div>

          {!collapsed && (
            <>
              <span className="font-semibold tracking-tight">Luna</span>
              <div className="ml-auto flex items-center gap-0.5">
                <RailButton label="Toggle theme" onClick={toggleTheme}>
                  {theme === "dark" ? (
                    <Sun className="size-3.5" />
                  ) : (
                    <Moon className="size-3.5" />
                  )}
                </RailButton>
                <RailButton
                  label="Collapse sidebar"
                  onClick={onToggleCollapse}
                  className="hidden md:flex"
                >
                  <PanelLeftClose className="size-3.5" />
                </RailButton>
              </div>
            </>
          )}
        </div>

        {/* New chat button */}
        <div className={collapsed ? "px-2" : "px-3"}>
          <button
            type="button"
            onClick={onNew}
            title="New chat"
            className={`flex w-full items-center gap-2.5 rounded-xl border text-xs font-semibold tracking-tight transition-all hover:shadow-xs active:scale-[0.98] ${
              collapsed ? "justify-center py-2.5" : "px-3.5 py-2.5"
            }`}
            style={{
              borderColor: "var(--border-strong)",
              background: "var(--bg-raised)",
              color: "var(--text)",
            }}
          >
            <Plus className="size-4 shrink-0 text-amber-500" />
            {!collapsed && <span>New chat</span>}
          </button>
        </div>

        {collapsed ? (
          <div className="mt-3 flex flex-1 flex-col items-center gap-1.5">
            <RailButton label="Expand sidebar" onClick={onToggleCollapse}>
              <PanelLeftOpen className="size-4" />
            </RailButton>
            <RailButton label="Toggle theme" onClick={toggleTheme}>
              {theme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </RailButton>
          </div>
        ) : (
          <nav className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {sessions.length === 0 && (
              <p
                className="px-3 py-4 text-center text-xs"
                style={{ color: "var(--text-faint)" }}
              >
                No conversations yet.
              </p>
            )}

            {groups.map(
              (g) =>
                g.items.length > 0 && (
                  <div key={g.name} className="mb-3">
                    <div
                      className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {g.name}
                    </div>
                    <ul className="space-y-0.5">
                      {g.items.map((s) => {
                        const active = s.id === activeId;
                        return (
                          <li key={s.id} className="group relative">
                            <button
                              type="button"
                              onClick={() => onOpen(s.id)}
                              className="w-full rounded-xl px-3 py-2 pr-8 text-left transition-colors"
                              style={{
                                background: active ? "var(--bg-hover)" : "transparent",
                                color: active ? "var(--text)" : "var(--text-muted)",
                              }}
                            >
                              {active && (
                                <span
                                  className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full"
                                  style={{ background: "var(--accent)" }}
                                />
                              )}
                              <span className="block truncate text-xs font-medium">
                                {s.title}
                              </span>
                              <span
                                className="text-[10px]"
                                style={{ color: "var(--text-faint)" }}
                              >
                                {relative(s.updatedAt)}
                                {s.messageCount
                                  ? ` · ${s.messageCount} msgs`
                                  : ""}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onDelete(s.id)}
                              aria-label={`Delete ${s.title}`}
                              className="absolute top-2.5 right-2 hidden size-5 items-center justify-center rounded-md opacity-40 transition-opacity hover:opacity-100 group-hover:flex"
                              style={{ color: "var(--danger)" }}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ),
            )}
          </nav>
        )}

        {/* Status indicator footer */}
        <div
          className={`flex items-center gap-2 border-t py-3 text-xs ${
            collapsed ? "justify-center px-0" : "px-4"
          }`}
          style={{ borderColor: "var(--border)", color: "var(--text-faint)" }}
          title={STATUS_LABEL[status]}
        >
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: dot }}
          />
          {!collapsed && STATUS_LABEL[status]}
        </div>
      </aside>
    </>
  );
}

function RailButton({
  children,
  label,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex size-7 items-center justify-center rounded-lg text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${className}`}
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </button>
  );
}

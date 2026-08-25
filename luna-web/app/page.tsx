"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  AudioLines,
  Command,
  Menu,
  Sparkles,
} from "lucide-react";
import { useLuna } from "@/lib/use-luna";
import { Sidebar } from "@/components/Sidebar";
import { MessageBubble } from "@/components/MessageBubble";
import { Composer } from "@/components/Composer";
import { VoiceMode } from "@/components/VoiceMode";
import { CommandPalette } from "@/components/CommandPalette";
import { ToastContainer } from "@/components/Toast";
import { LunaHeroLogo } from "@/components/LunaLogo";

const SUGGESTIONS = [
  { title: "Take stock", body: "What can you do? List your tools and skills." },
  { title: "Look around", body: "List the files in your workspace." },
  { title: "Write something", body: "Write a Python script that renames files by date." },
  { title: "Remember", body: "Summarize what you remember about me." },
];

export default function Page() {
  const luna = useLuna();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("luna-sidebar") === "collapsed");
    } catch {
      // Ignored
    }
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("luna-sidebar", next ? "collapsed" : "expanded");
      } catch {
        // Ignored
      }
      return next;
    });
  };

  // Keyboard shortcut ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Follow stream only while pinned to bottom
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [luna.messages]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isPinned = distanceToBottom < 80;
    pinnedRef.current = isPinned;
    setShowScrollBottom(!isPinned && luna.messages.length > 0);
  };

  const scrollToBottom = () => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    pinnedRef.current = true;
    setShowScrollBottom(false);
  };

  const lastReply = useMemo(() => {
    for (let i = luna.messages.length - 1; i >= 0; i--) {
      const m = luna.messages[i];
      if (m.role === "assistant" && !m.streaming && m.text.trim()) return m;
    }
    return null;
  }, [luna.messages]);

  const empty = luna.messages.length === 0;
  const connecting = luna.status !== "open";
  const model = lastReply?.usage?.model;
  const contextPercent = lastReply?.usage?.contextPercent;

  return (
    <div className="flex h-dvh overflow-hidden">
      <ToastContainer />

      <CommandPalette
        open={commandPaletteOpen}
        sessions={luna.sessions}
        activeId={luna.storedId}
        onClose={() => setCommandPaletteOpen(false)}
        onNewChat={() => void luna.newChat()}
        onOpenSession={(id) => void luna.openSession(id)}
        onVoiceMode={() => setVoiceOpen(true)}
        onToggleTheme={() => {
          const current =
            document.documentElement.getAttribute("data-theme") === "dark"
              ? "light"
              : "dark";
          document.documentElement.setAttribute("data-theme", current);
          try {
            localStorage.setItem("luna-theme", current);
          } catch {
            // Ignored
          }
        }}
      />

      <Sidebar
        open={sidebarOpen}
        collapsed={collapsed}
        sessions={luna.sessions}
        activeId={luna.storedId}
        status={luna.status}
        onNew={() => {
          void luna.newChat();
          setSidebarOpen(false);
        }}
        onOpen={(id) => {
          void luna.openSession(id);
          setSidebarOpen(false);
        }}
        onDelete={(id) => void luna.deleteSession(id)}
        onClose={() => setSidebarOpen(false)}
        onToggleCollapse={toggleCollapse}
      />

      <main className="luna-aurora relative flex min-w-0 flex-1 flex-col">
        {/* Top Navigation Bar */}
        <header
          className="relative z-10 flex items-center gap-2 border-b px-4 py-2.5 backdrop-blur-md"
          style={{
            borderColor: "var(--border)",
            background: "color-mix(in srgb, var(--bg-raised) 75%, transparent)",
          }}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open conversations"
            className="flex size-8 items-center justify-center rounded-xl md:hidden"
            style={{ color: "var(--text-muted)" }}
          >
            <Menu className="size-4" />
          </button>

          <span className="truncate text-xs font-semibold tracking-tight">
            {luna.sessions.find((s) => s.id === luna.storedId)?.title ?? "New conversation"}
          </span>

          {model && (
            <span
              className="ml-2 hidden rounded-full px-2.5 py-0.5 text-[10px] font-medium sm:inline"
              style={{
                background: "var(--bg-hover)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
            >
              {model}
              {contextPercent != null ? ` · ${contextPercent}%` : ""}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              title="Command palette (⌘K)"
              className="flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{
                borderColor: "var(--border)",
                color: "var(--text-muted)",
              }}
            >
              <Command className="size-3" />
              <span className="hidden sm:inline">Commands</span>
              <kbd
                className="hidden rounded px-1 text-[10px] font-mono sm:inline"
                style={{ background: "var(--bg-hover)" }}
              >
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={() => setVoiceOpen(true)}
              disabled={connecting}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-40"
              style={{
                background: "var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              <AudioLines className="size-3.5" />
              <span>Voice</span>
            </button>
          </div>
        </header>

        {luna.fatal && (
          <div
            className="relative z-10 border-b px-4 py-2.5 text-xs font-medium"
            style={{
              borderColor: "var(--danger)",
              background: "var(--bg-sunken)",
              color: "var(--danger)",
            }}
          >
            {luna.fatal}
          </div>
        )}

        {/* Message Scroll Area */}
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="relative z-10 min-h-0 flex-1 overflow-y-auto"
        >
          {empty ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 text-center">
              <LunaHeroLogo size={68} className="mb-5" />

              <h1 className="mb-2 text-2xl font-semibold tracking-tight">
                Good to see you.
              </h1>
              <p className="mb-8 max-w-md text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Ask me anything, have me search the web, manage workspace files, or run code commands.
              </p>

              <div className="grid w-full gap-2.5 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    disabled={connecting}
                    onClick={() => void luna.send(s.body)}
                    className="group rounded-2xl border p-3.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99] disabled:opacity-40"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--bg-raised)",
                      boxShadow: "var(--shadow)",
                    }}
                  >
                    <div
                      className="flex items-center gap-1.5 text-xs font-semibold"
                      style={{ color: "var(--text)" }}
                    >
                      <Sparkles className="size-3 text-amber-500" />
                      <span>{s.title}</span>
                    </div>
                    <div
                      className="mt-1 text-[11px] leading-normal"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {s.body}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
              {luna.messages.map((m) => (
                <div key={m.id} className="luna-rise">
                  <MessageBubble message={m} />
                </div>
              ))}
            </div>
          )}

          {/* Floating Scroll to Bottom Button */}
          {showScrollBottom && (
            <div className="sticky bottom-3 z-20 flex justify-center">
              <button
                type="button"
                onClick={scrollToBottom}
                aria-label="Scroll to bottom"
                className="luna-rise flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-xl transition-all hover:scale-105 active:scale-95"
                style={{
                  background: "var(--bg-raised)",
                  borderColor: "var(--border-strong)",
                  color: "var(--text)",
                }}
              >
                <ArrowDown className="size-3.5" />
                <span>Jump to latest</span>
              </button>
            </div>
          )}
        </div>

        {/* Bottom Composer */}
        <div className="relative z-10">
          <Composer
            busy={luna.busy}
            disabled={connecting}
            statusLine={luna.statusLine}
            onSend={(text, images) => void luna.send(text, images)}
            onInterrupt={() => void luna.interrupt()}
            onAttachImage={luna.attachImage}
            onVoiceMode={() => setVoiceOpen(true)}
          />
        </div>
      </main>

      {voiceOpen && (
        <VoiceMode
          busy={luna.busy}
          replyText={lastReply?.text ?? ""}
          replyId={lastReply?.id ?? null}
          onSend={(text) => void luna.send(text)}
          onInterrupt={() => void luna.interrupt()}
          onClose={() => setVoiceOpen(false)}
        />
      )}
    </div>
  );
}

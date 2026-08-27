"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  AudioLines,
  CalendarClock,
  Command,
  Menu,
  Sparkles,
} from "lucide-react";
import { useLuna } from "@/lib/use-luna";
import { Sidebar } from "@/components/Sidebar";
import { MessageBubble } from "@/components/MessageBubble";
import { Composer } from "@/components/Composer";
import { VoiceMode } from "@/components/VoiceMode";
import { ApprovalPrompt } from "@/components/ApprovalPrompt";
import { WorkspacePanel } from "@/components/WorkspacePanel";
import { useWakeWord } from "@/lib/use-wake-word";
import { useScreen, wantsScreen } from "@/lib/use-screen";
import { detectOpenIntent, detectPlayIntent } from "@/lib/intents";
import { parseActions, resolveActionUrl } from "@/lib/actions";
import { showToast } from "@/lib/use-toast";
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
  const [wakeOn, setWakeOn] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const screen = useScreen();

  /**
   * Sends a message, first attaching a screenshot when the request is about
   * what's on screen ("read the screen", "translate this", "what's on my
   * display"). Luna's vision toolset does the rest.
   */
  const send = useCallback(
    async (text: string, images: string[] = []) => {
      // "play <something>" is handled here rather than left to the model:
      // a lite model will often web-search and return a link instead. Opening
      // inside this call also keeps us within the user's click.
      const play = detectPlayIntent(text);
      if (play) {
        // Resolve first, then open — no blank tab to stare at. Chrome keeps
        // user activation alive for ~5s after the click, and the lookup takes
        // one or two, so the open is still permitted.
        void luna.send(text, images);
        try {
          const url = await resolveActionUrl({
            type: "play",
            source: "youtube",
            query: play.query,
            label: play.query,
          });
          const opened = window.open(url, "_blank", "noopener,noreferrer");
          // A blocker refusing is silent, so confirm rather than assume.
          if (opened === null && document.visibilityState === "visible") {
            showToast("Your browser blocked the tab — check the address bar.", "info");
          }
        } catch {
          showToast("Could not find that video.", "error");
        }
        return;
      }

      // "open <site>" resolves without the model too, for the same reasons.
      // Fast path only for sites we can name with certainty — everything else
      // goes to Luna, who resolves it and whose action we auto-open below.
      const opening = detectOpenIntent(text);
      if (opening) {
        void luna.send(text, images);
        window.open(opening.url, "_blank", "noopener,noreferrer");
        return;
      }

      if (wantsScreen(text)) {
        try {
          showToast("Reading your screen…", "info");
          const shot = await screen.capture();
          await luna.attachImage(shot);
          await luna.send(text, [...images, shot]);
          return;
        } catch {
          showToast("Screen sharing was cancelled.", "error");
          // Fall through: answer without the screenshot rather than doing nothing.
        }
      }
      await luna.send(text, images);
    },
    [luna, screen],
  );

  useEffect(() => {
    try {
      setWakeOn(localStorage.getItem("luna-wake") === "on");
    } catch {
      // Blocked storage — wake word stays off until switched on.
    }
  }, []);

  const toggleWake = () => {
    setWakeOn((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("luna-wake", next ? "on" : "off");
      } catch {
        // Non-fatal: the preference just won't persist.
      }
      showToast(
        next ? 'Listening for "Luna …"' : "Wake word off",
        next ? "success" : "info",
      );
      return next;
    });
  };

  // Full voice mode owns the microphone, so the wake listener stands down
  // while it's open.
  useWakeWord({
    enabled: wakeOn && !voiceOpen && luna.status === "open",
    onWake: (command) => {
      setVoiceOpen(true);
      void send(command);
    },
  });
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

  // Launch parameters from the desktop bar: ?q=… sends a question straight
  // away, ?voice=1 drops into voice mode. Consumed once, then stripped from
  // the URL so a refresh doesn't re-fire them.
  const launchHandledRef = useRef(false);

  useEffect(() => {
    if (launchHandledRef.current) return;
    if (luna.status !== "open") return;
    launchHandledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const voice = params.get("voice");
    if (!q && !voice) return;

    if (voice) setVoiceOpen(true);
    if (q) void send(q);

    window.history.replaceState({}, "", window.location.pathname);
  }, [luna.status, send]);

  // Auto-open whatever Luna decided to open.
  //
  // She makes the judgment call — misspellings, "the best Quran recitation",
  // which site a vague name means — and the client just executes it. This
  // fires from a reply callback rather than a click, so a popup blocker may
  // refuse; when it does we say so once instead of failing silently. The chip
  // stays in the message either way.
  const autoOpenedRef = useRef<string>("");

  useEffect(() => {
    const last = luna.messages[luna.messages.length - 1];
    if (!last || last.role !== "assistant" || last.streaming) return;
    if (autoOpenedRef.current === last.id) return;

    const { actions } = parseActions(last.text);
    if (actions.length === 0) return;

    autoOpenedRef.current = last.id;

    void (async () => {
      try {
        const url = await resolveActionUrl(actions[0]);
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (opened === null) {
          showToast(
            "Allow pop-ups for this site so Luna can open things herself.",
            "info",
            6000,
          );
        }
      } catch {
        // The chip is still there to click.
      }
    })();
  }, [luna.messages]);

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
    <div
      className="flex h-dvh overflow-hidden"
      // One ground for the whole shell, so a collapsed (transparent) sidebar
      // sits on exactly the same tone as the conversation beside it.
      style={{ background: "var(--chat-bg)" }}
    >
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

      <main
        className="luna-aurora relative flex min-w-0 flex-1 flex-col"
        style={{ background: "var(--chat-bg)" }}
      >
        {/* Floating command bar — detached from the edges so the ambient
            field reads around it, and narrow enough to feel like a control
            rather than a page chrome. */}
        <header
          className="luna-glass luna-edge-lit pointer-events-auto absolute inset-x-0 top-3 z-30 mx-auto flex w-[calc(100%-1.5rem)] max-w-3xl items-center gap-2 rounded-full py-1.5 pr-2 pl-3"
          style={{ boxShadow: "0 12px 34px -18px rgb(0 0 0 / 0.7)" }}
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

          {contextPercent != null && (
            <span
              className="ml-2 hidden rounded-full px-2 py-0.5 text-[10px] font-medium lg:inline"
              style={{ background: "var(--bg-hover)", color: "var(--text-faint)" }}
              title="Context used in this conversation"
            >
              {contextPercent}%
            </span>
          )}

          <div className="ml-auto flex items-center gap-1.5">

            <button
              type="button"
              onClick={() => setWorkspaceOpen(true)}
              title="Schedules and projects"
              aria-label="Schedules and projects"
              className="luna-pill flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-muted)" }}
            >
              <CalendarClock className="size-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setVoiceOpen(true)}
              disabled={connecting}
              className="luna-pill flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all hover:brightness-110 active:scale-95 disabled:opacity-40"
              style={{
                background: "var(--grad-brand)",
                color: "var(--accent-text)",
              }}
            >
              <AudioLines className="size-3.5" />
              <span>Voice</span>
            </button>

            <button
              type="button"
              onClick={toggleWake}
              disabled={connecting}
              title={
                wakeOn
                  ? 'Listening for "Luna …" — click to stop'
                  : 'Always listen for "Luna …"'
              }
              aria-pressed={wakeOn}
              className="luna-pill flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all hover:brightness-110 active:scale-95 disabled:opacity-40"
              style={{
                background: wakeOn ? "var(--accent)" : "transparent",
                color: wakeOn ? "var(--accent-text)" : "var(--text-muted)",
                boxShadow: wakeOn ? "var(--glow)" : "none",
              }}
            >
              <span
                className={wakeOn ? "luna-dot size-1.5 rounded-full" : "size-1.5 rounded-full"}
                style={{ background: wakeOn ? "var(--accent-text)" : "var(--text-faint)" }}
              />
              <span>Luna</span>
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
          className="luna-chat-surface relative z-10 min-h-0 flex-1 overflow-y-auto pt-16"
        >
          {empty ? (
            <div className="relative z-10 mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 text-center">
              <LunaHeroLogo size={68} className="mb-5" />

              <h1 className="luna-grad-text mb-2 text-[2rem] font-semibold tracking-tight">
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
                    onClick={() => void send(s.body)}
                    className="luna-glass luna-grad-ring group rounded-2xl p-4 text-left transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] disabled:opacity-40"
                  >
                    <div
                      className="flex items-center gap-1.5 text-xs font-semibold"
                      style={{ color: "var(--text)" }}
                    >
                      <Sparkles
                        className="size-3.5 transition-transform duration-200 group-hover:scale-110"
                        style={{ color: "var(--accent)" }}
                      />
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
            <div className="relative z-10 mx-auto max-w-3xl space-y-6 px-4 py-6">
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

        {/* Bottom Composer — same surface as the thread above it, so the
            conversation column reads as one continuous sheet. */}
        <div
          className="relative z-10"
          style={{ background: "var(--chat-bg)" }}
        >
          <Composer
            busy={luna.busy}
            disabled={connecting}
            statusLine={luna.statusLine}
            onSend={(text, images) => void send(text, images)}
            onInterrupt={() => void luna.interrupt()}
            onAttachImage={luna.attachImage}
            onVoiceMode={() => setVoiceOpen(true)}
            listModels={luna.listModels}
            setModel={luna.setModel}
          />
        </div>
      </main>

      {workspaceOpen && (
        <WorkspacePanel
          onClose={() => setWorkspaceOpen(false)}
          listCrons={luna.listCrons}
          addCron={luna.addCron}
          removeCron={luna.removeCron}
          setCronEnabled={luna.setCronEnabled}
        />
      )}

      {luna.approval && (
        <ApprovalPrompt
          request={luna.approval}
          onRespond={(choice) => void luna.respondApproval(choice)}
        />
      )}

      {voiceOpen && (
        <VoiceMode
          busy={luna.busy}
          replyText={lastReply?.text ?? ""}
          replyId={lastReply?.id ?? null}
          onSend={(text) => void send(text)}
          onInterrupt={() => void luna.interrupt()}
          onClose={() => setVoiceOpen(false)}
        />
      )}
    </div>
  );
}

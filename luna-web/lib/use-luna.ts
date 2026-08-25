"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getLunaClient,
  type ConnectionStatus,
  type LunaEvent,
} from "./luna-client";
import type { Message, SessionSummary, ToolCall, Usage } from "./types";

/** Delta frames carry their text under one of a few keys depending on source. */
function deltaText(payload: Record<string, unknown>): string {
  for (const key of ["text", "delta", "content", "chunk"]) {
    const v = payload[key];
    if (typeof v === "string") return v;
  }
  return "";
}

function toUsage(raw: unknown): Usage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as Record<string, number | string>;
  return {
    model: typeof u.model === "string" ? u.model : undefined,
    input: Number(u.input) || undefined,
    output: Number(u.output) || undefined,
    total: Number(u.total) || undefined,
    contextUsed: Number(u.context_used) || undefined,
    contextMax: Number(u.context_max) || undefined,
    contextPercent: Number(u.context_percent) || undefined,
  };
}

let uid = 0;
const nextId = () => `m${++uid}`;

export function useLuna() {
  const client = useRef(getLunaClient()).current;

  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [storedId, setStoredId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<string>("");
  const [fatal, setFatal] = useState<string | null>(null);

  // The assistant message currently being streamed into.
  const activeRef = useRef<string | null>(null);
  const sessionsChangedDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  const patchActive = useCallback((fn: (m: Message) => Message) => {
    const id = activeRef.current;
    if (!id) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  /** Ensure there is an assistant message to stream into, and return its id. */
  const ensureActive = useCallback((): string => {
    if (activeRef.current) return activeRef.current;
    const id = nextId();
    activeRef.current = id;
    setMessages((prev) => [
      ...prev,
      { id, role: "assistant", text: "", tools: [], streaming: true },
    ]);
    return id;
  }, []);

  // ---- event wiring -------------------------------------------------------
  useEffect(() => {
    const offStatus = client.onStatus(setStatus);

    const offEvent = client.onEvent((e: LunaEvent) => {
      const p = e.payload;

      switch (e.type) {
        case "message.start": {
          ensureActive();
          setBusy(true);
          break;
        }

        case "message.delta": {
          const chunk = deltaText(p);
          if (!chunk) break;
          ensureActive();
          patchActive((m) => ({ ...m, text: m.text + chunk }));
          break;
        }

        case "thinking.delta":
        case "reasoning.delta": {
          const chunk = deltaText(p);
          if (!chunk) break;
          ensureActive();
          patchActive((m) => ({ ...m, reasoning: (m.reasoning ?? "") + chunk }));
          break;
        }

        case "message.complete": {
          ensureActive();
          const finalText = typeof p.text === "string" ? p.text : undefined;
          const reasoning =
            typeof p.reasoning === "string" ? p.reasoning : undefined;
          patchActive((m) => ({
            ...m,
            // Prefer the authoritative final text when the server sends it.
            text:
              finalText && finalText.length >= m.text.length
                ? finalText
                : m.text,
            reasoning: reasoning ?? m.reasoning,
            usage: toUsage(p.usage) ?? m.usage,
            streaming: false,
          }));
          activeRef.current = null;
          setBusy(false);
          setStatusLine("");
          break;
        }

        case "tool.start":
        case "tool.started": {
          ensureActive();
          const call: ToolCall = {
            id: String(p.tool_id ?? nextId()),
            name: String(p.name ?? "tool"),
            context: typeof p.context === "string" ? p.context : "",
            args: (p.args as Record<string, unknown>) ?? {},
            status: "running",
          };
          patchActive((m) => ({ ...m, tools: [...m.tools, call] }));
          break;
        }

        case "tool.complete": {
          const toolId = String(p.tool_id ?? "");
          const result = (p.result ?? {}) as Record<string, unknown>;
          const failed = result.error != null || Number(result.exit_code) > 0;
          patchActive((m) => ({
            ...m,
            tools: m.tools.map((t) =>
              t.id === toolId
                ? {
                    ...t,
                    status: failed ? "error" : "done",
                    durationS: Number(p.duration_s) || undefined,
                    output:
                      typeof result.output === "string"
                        ? result.output
                        : undefined,
                    exitCode:
                      result.exit_code == null
                        ? undefined
                        : Number(result.exit_code),
                    error: typeof result.error === "string" ? result.error : null,
                  }
                : t,
            ),
          }));
          break;
        }

        case "status.update": {
          const s = p.text ?? p.status ?? p.message;
          setStatusLine(typeof s === "string" ? s : "");
          break;
        }

        case "turn.start":
        case "turn.started":
          setBusy(true);
          break;

        case "turn.end":
          setBusy(false);
          setStatusLine("");
          break;

        case "turn.error": {
          const msg =
            typeof p.message === "string"
              ? p.message
              : typeof p.error === "string"
                ? p.error
                : "The turn failed.";
          ensureActive();
          patchActive((m) => ({ ...m, error: msg, streaming: false }));
          activeRef.current = null;
          setBusy(false);
          break;
        }

        case "session.title": {
          const title = typeof p.title === "string" ? p.title : "";
          if (!title) break;
          setSessions((prev) =>
            prev.map((s) =>
              s.id === (p.session_id ?? storedId) ? { ...s, title } : s,
            ),
          );
          break;
        }

        case "sessions.changed":
          if (sessionsChangedDebounceTimer.current) {
            clearTimeout(sessionsChangedDebounceTimer.current);
          }
          sessionsChangedDebounceTimer.current = setTimeout(() => {
            void refreshSessions();
          }, 300);
          break;
      }
    });

    return () => {
      offStatus();
      offEvent();
      if (sessionsChangedDebounceTimer.current) {
        clearTimeout(sessionsChangedDebounceTimer.current);
      }
    };
    // refreshSessions is stable via useCallback below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, ensureActive, patchActive, storedId]);

  // ---- actions ------------------------------------------------------------
  const refreshSessions = useCallback(async () => {
    try {
      const res = await client.rpc<{ sessions?: unknown[] }>(
        "session.list",
        {},
      );
      const list = (res.sessions ?? []).map((raw) => {
        const s = raw as Record<string, unknown>;
        const title = String(s.title ?? "").trim();
        const preview = String(s.preview ?? "").trim();
        return {
          id: String(s.id),
          // Server titles are model-generated and sometimes junk ("**", "```json").
          title:
            title.length > 2 && !/^[`*\s)]+$/.test(title)
              ? title
              : preview.slice(0, 60) || "New chat",
          updatedAt: Number(s.started_at) || undefined,
          messageCount: Number(s.message_count) || undefined,
        } satisfies SessionSummary;
      });
      setSessions(list);
    } catch {
      // Ignored
    }
  }, [client]);

  const newChat = useCallback(async () => {
    setFatal(null);
    try {
      const res = await client.rpc<{
        session_id: string;
        stored_session_id?: string;
      }>("session.create", {});
      setSessionId(res.session_id);
      setStoredId(res.stored_session_id ?? null);
      setMessages([]);
      activeRef.current = null;
      setBusy(false);
      void refreshSessions();
    } catch (err) {
      setFatal(err instanceof Error ? err.message : "Could not start a chat.");
    }
  }, [client, refreshSessions]);

  const openSession = useCallback(
    async (stored: string) => {
      setFatal(null);
      try {
        const res = await client.rpc<{
          session_id: string;
          messages?: unknown[];
        }>("session.resume", { session_id: stored });

        setSessionId(res.session_id);
        setStoredId(stored);
        activeRef.current = null;
        setBusy(false);

        // Replay the transcript: tool rows attach to the assistant turn
        // that follows them, matching how they streamed originally.
        const out: Message[] = [];
        let pendingTools: ToolCall[] = [];

        for (const raw of res.messages ?? []) {
          const m = raw as Record<string, unknown>;
          const role = String(m.role ?? "");
          if (role === "tool") {
            pendingTools.push({
              id: nextId(),
              name: String(m.name ?? "tool"),
              context: typeof m.context === "string" ? m.context : "",
              args: (m.args as Record<string, unknown>) ?? {},
              status: "done",
            });
            continue;
          }
          if (role !== "user" && role !== "assistant") continue;

          out.push({
            id: nextId(),
            role,
            text: String(m.text ?? ""),
            tools: role === "assistant" ? pendingTools : [],
          });
          if (role === "assistant") pendingTools = [];
        }
        if (pendingTools.length) {
          out.push({
            id: nextId(),
            role: "assistant",
            text: "",
            tools: pendingTools,
          });
        }
        setMessages(out);
      } catch (err) {
        setFatal(err instanceof Error ? err.message : "Could not open that chat.");
      }
    },
    [client],
  );

  const send = useCallback(
    async (text: string, images: string[] = []) => {
      const body = text.trim();
      if (!body || busy) return;

      let sid = sessionId;
      if (!sid) {
        // No session yet (first message, or connect-time create failed).
        const res = await client.rpc<{
          session_id: string;
          stored_session_id?: string;
        }>("session.create", {});
        sid = res.session_id;
        setSessionId(sid);
        setStoredId(res.stored_session_id ?? null);
      }

      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "user", text: body, tools: [], images },
      ]);
      setBusy(true);

      try {
        await client.rpc("prompt.submit", { session_id: sid, text: body });
      } catch (err) {
        setBusy(false);
        const msg = err instanceof Error ? err.message : "Send failed.";
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", text: "", tools: [], error: msg },
        ]);
      }
    },
    [busy, client, sessionId],
  );

  /** Upload an image into the session; the next prompt.submit picks it up. */
  const attachImage = useCallback(
    async (dataUrl: string) => {
      if (!sessionId) return;
      await client.rpc("image.attach_bytes", {
        session_id: sessionId,
        content_base64: dataUrl,
        filename: `capture-${Date.now()}.jpg`,
      });
    },
    [client, sessionId],
  );

  const interrupt = useCallback(async () => {
    if (!sessionId) return;
    try {
      await client.rpc("session.interrupt", { session_id: sessionId });
    } finally {
      setBusy(false);
      patchActive((m) => ({ ...m, streaming: false }));
      activeRef.current = null;
    }
  }, [client, patchActive, sessionId]);

  const deleteSession = useCallback(
    async (stored: string) => {
      try {
        await client.rpc("session.delete", { session_id: stored });
        if (stored === storedId) await newChat();
        void refreshSessions();
      } catch {
        // Leave row in place
      }
    },
    [client, newChat, refreshSessions, storedId],
  );

  // Connect once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await client.connect();
        if (cancelled) return;
        await refreshSessions();
        await newChat();
      } catch (err) {
        if (!cancelled) {
          setFatal(
            err instanceof Error ? err.message : "Could not connect to Luna.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    fatal,
    sessions,
    storedId,
    messages,
    busy,
    statusLine,
    send,
    attachImage,
    interrupt,
    newChat,
    openSession,
    deleteSession,
    refreshSessions,
  };
}

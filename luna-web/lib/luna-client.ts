"use client";

/**
 * Browser client for Luna's JSON-RPC WebSocket gateway.
 *
 * Wire protocol (from tui_gateway/ws.py): newline-delimited JSON-RPC in both
 * directions. The server emits a `gateway.ready` event on accept, then
 * responses keyed by request id and `method: "event"` frames for everything
 * streaming. Per-token frames are coalesced server-side, so a single
 * `message.delta` may carry several tokens' worth of text.
 */

export type LunaEvent = { type: string; payload: Record<string, unknown> };

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

const RPC_TIMEOUT_MS = 120_000;

export class LunaClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(e: LunaEvent) => void>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private connecting: Promise<void> | null = null;
  private closedByUs = false;

  status: ConnectionStatus = "idle";

  onEvent(fn: (e: LunaEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    for (const fn of this.statusListeners) fn(s);
  }

  /** Idempotent: concurrent callers share one in-flight connection attempt. */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.connecting) return this.connecting;

    this.closedByUs = false;
    this.setStatus("connecting");

    this.connecting = (async () => {
      const res = await fetch("/api/luna/ticket", { method: "POST" });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "" }));
        throw new Error(error || `Could not reach Luna (${res.status}).`);
      }
      const { ticket, wsBase } = (await res.json()) as {
        ticket: string;
        wsBase: string;
      };

      await new Promise<void>((resolve, reject) => {
        // Tickets are single-use with a 30s TTL — this socket consumes it.
        const ws = new WebSocket(`${wsBase}/api/ws?ticket=${ticket}`);
        this.ws = ws;

        const onFail = () => reject(new Error("WebSocket closed during handshake."));
        ws.addEventListener("error", onFail, { once: true });
        ws.addEventListener("close", onFail, { once: true });

        ws.addEventListener("message", (ev) => this.handleFrame(ev.data as string));

        ws.addEventListener("open", () => {
          ws.removeEventListener("close", onFail);
          ws.removeEventListener("error", onFail);
          this.setStatus("open");

          ws.addEventListener("close", () => {
            this.failAllPending("Connection to Luna closed.");
            this.setStatus(this.closedByUs ? "idle" : "closed");
          });

          resolve();
        });
      });
    })();

    try {
      await this.connecting;
    } catch (err) {
      this.setStatus("error");
      throw err;
    } finally {
      this.connecting = null;
    }
  }

  private handleFrame(raw: string) {
    // Frames arrive newline-delimited; a single message may batch several.
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        continue;
      }

      const id = msg.id as number | undefined;
      if (typeof id === "number" && this.pending.has(id)) {
        const p = this.pending.get(id)!;
        this.pending.delete(id);
        if (msg.error) {
          const e = msg.error as { message?: string; code?: number };
          p.reject(new Error(e.message ?? `RPC error ${e.code ?? ""}`.trim()));
        } else {
          p.resolve(msg.result);
        }
        continue;
      }

      if (msg.method === "event") {
        const params = (msg.params ?? {}) as {
          type?: string;
          payload?: Record<string, unknown>;
        };
        if (params.type) {
          const event = { type: params.type, payload: params.payload ?? {} };
          for (const fn of this.listeners) fn(event);
        }
      }
    }
  }

  private failAllPending(reason: string) {
    for (const [, p] of this.pending) p.reject(new Error(reason));
    this.pending.clear();
  }

  async rpc<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    await this.connect();
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to Luna.");
    }

    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out.`));
      }, RPC_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });

      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  /** Fire-and-forget notification (no response expected). */
  notify(method: string, params: Record<string, unknown> = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
    }
  }

  disconnect() {
    this.closedByUs = true;
    this.ws?.close();
    this.ws = null;
  }
}

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";

let singleton: LunaClient | null = null;

/** One socket per tab — every component shares it. */
export function getLunaClient(): LunaClient {
  if (!singleton) singleton = new LunaClient();
  return singleton;
}

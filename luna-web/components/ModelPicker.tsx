"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Cpu, Loader2 } from "lucide-react";
import { showToast } from "@/lib/use-toast";

type Provider = { slug: string; name: string; models: string[] };

/** Trims the provider prefix so the menu reads cleanly. */
function shortName(model: string) {
  return model.replace(/^[a-z0-9-]+\//, "");
}

export function ModelPicker({
  listModels,
  setModel,
}: {
  listModels: () => Promise<{ current: string; providers: Provider[] }>;
  setModel: (model: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { current: cur, providers: provs } = await listModels();
      setCurrent(cur);
      setProviders(provs);
    } catch {
      showToast("Could not load the model list.", "error");
    } finally {
      setLoading(false);
    }
  }, [listModels]);

  const refreshCurrent = useCallback(async () => {
    try {
      const res = await fetch("/api/luna/model");
      if (!res.ok) return;
      const { model } = (await res.json()) as { model?: string };
      if (model) setCurrent(model);
    } catch {
      // Non-fatal — the pill just keeps its last known value.
    }
  }, []);

  useEffect(() => {
    void refreshCurrent();
  }, [refreshCurrent]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = async (model: string) => {
    setOpen(false);
    const previous = current;
    setCurrent(model); // optimistic — revert if the write fails
    try {
      await setModel(model);
      await refreshCurrent();
      showToast(`Now using ${shortName(model)}`, "success");
    } catch (err) {
      setCurrent(previous);
      showToast(
        err instanceof Error ? err.message : "Could not switch model.",
        "error",
      );
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        title="Change model"
        className="luna-pill flex max-w-52 items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--bg-hover)]"
        style={{ color: "var(--text-muted)" }}
      >
        <Cpu className="size-3.5 shrink-0" style={{ color: "var(--accent)" }} />
        <span className="truncate">{current ? shortName(current) : "Model"}</span>
        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          className="luna-glass-strong absolute bottom-full left-0 z-50 mb-2 max-h-80 w-72 overflow-y-auto rounded-2xl p-1.5"
          role="menu"
        >
          {loading && (
            <div
              className="flex items-center gap-2 px-3 py-3 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              <Loader2 className="size-3.5 animate-spin" />
              Loading models…
            </div>
          )}

          {!loading && providers.length === 0 && (
            <div className="px-3 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
              No providers configured.
            </div>
          )}

          {!loading &&
            providers.map((p) => (
              <div key={p.slug} className="mb-1 last:mb-0">
                <div
                  className="px-2.5 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase"
                  style={{ color: "var(--text-faint)" }}
                >
                  {p.name}
                </div>

                {p.models.map((m) => {
                  const active = m === current;
                  return (
                    <button
                      key={`${p.slug}-${m}`}
                      type="button"
                      role="menuitem"
                      onClick={() => void choose(m)}
                      className={`luna-pill flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs ${
                        active ? "luna-pill-active" : "hover:bg-[var(--bg-hover)]"
                      }`}
                      style={{ color: active ? "var(--text)" : "var(--text-muted)" }}
                    >
                      <span className="flex-1 truncate">{shortName(m)}</span>
                      {active && (
                        <Check className="size-3.5 shrink-0" style={{ color: "var(--accent)" }} />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useToast, type ToastMessage } from "@/lib/use-toast";

const ICON_MAP = {
  success: <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />,
  error: <AlertCircle className="size-4 shrink-0 text-red-500" />,
  info: <Info className="size-4 shrink-0 text-blue-500" />,
};

export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 bottom-5 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="luna-rise pointer-events-auto flex min-w-[240px] max-w-sm items-center gap-3 rounded-2xl border px-3.5 py-2.5 shadow-lg backdrop-blur-xl transition-all"
      style={{
        background: "var(--bg-raised)",
        borderColor: "var(--border-strong)",
        color: "var(--text)",
        boxShadow: "var(--shadow)",
      }}
    >
      {ICON_MAP[toast.type]}
      <span className="flex-1 text-xs font-medium">{toast.text}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss toast"
        className="flex size-5 items-center justify-center rounded-md opacity-60 hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

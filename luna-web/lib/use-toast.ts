"use client";

import { useCallback, useEffect, useState } from "react";

export type ToastMessage = {
  id: string;
  type: "info" | "success" | "error";
  text: string;
};

type ToastListener = (toasts: ToastMessage[]) => void;

let currentToasts: ToastMessage[] = [];
const listeners = new Set<ToastListener>();

function notify() {
  for (const fn of listeners) {
    fn([...currentToasts]);
  }
}

export function showToast(
  text: string,
  type: "info" | "success" | "error" = "info",
  duration = 3000,
) {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const item: ToastMessage = { id, type, text };
  currentToasts = [...currentToasts, item];
  notify();

  setTimeout(() => {
    currentToasts = currentToasts.filter((t) => t.id !== id);
    notify();
  }, duration);
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>(currentToasts);

  useEffect(() => {
    listeners.add(setToasts);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    currentToasts = currentToasts.filter((t) => t.id !== id);
    notify();
  }, []);

  return { toasts, showToast, dismiss };
}

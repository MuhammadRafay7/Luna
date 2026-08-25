"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

/**
 * Captures a still from the browser's camera via getUserMedia.
 */
export function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (dataUrl: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) {
          setError(
            "Could not open the camera. Check the browser's permission prompt.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shoot = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    await onCapture(canvas.toDataURL("image/jpeg", 0.9));
  }, [onCapture]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
      style={{ background: "rgb(0 0 0 / 0.6)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Camera"
    >
      <div
        className="luna-rise w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl"
        style={{
          borderColor: "var(--border-strong)",
          background: "var(--bg-raised)",
          boxShadow: "var(--shadow)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Camera className="size-4 text-amber-500" />
            <span>Take a Photo</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera"
            className="flex size-6 items-center justify-center rounded-md opacity-40 hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        </div>

        {error ? (
          <div className="p-8 text-center text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="block w-full"
            style={{
              background: "#000",
              aspectRatio: "4 / 3",
              objectFit: "cover",
            }}
          />
        )}

        <div
          className="flex items-center justify-end gap-2 border-t p-3"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3.5 py-2 text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: "var(--text-muted)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={shoot}
            disabled={Boolean(error)}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-transform hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          >
            <Camera className="size-3.5" /> Capture Photo
          </button>
        </div>
      </div>
    </div>
  );
}

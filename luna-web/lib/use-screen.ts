"use client";

import { useCallback, useRef } from "react";

/**
 * Grabs a still frame of a screen or window the user picks.
 *
 * The browser owns this: getDisplayMedia shows a native picker and the user
 * chooses exactly what Luna may see. The container has no display of its own,
 * so this is the only way she can look at your screen — and it is explicitly
 * consented to, every session.
 *
 * The stream is kept alive between captures so repeated "read the screen"
 * requests don't re-prompt. Call `release` to stop sharing.
 */
export function useScreen() {
  const streamRef = useRef<MediaStream | null>(null);

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const ensureStream = useCallback(async (): Promise<MediaStream> => {
    const live =
      streamRef.current &&
      streamRef.current.getVideoTracks().some((t) => t.readyState === "live");
    if (live && streamRef.current) return streamRef.current;

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 },
      audio: false,
    });
    streamRef.current = stream;

    // The user can stop sharing from the browser's own bar.
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      streamRef.current = null;
    });
    return stream;
  }, []);

  /** Returns a JPEG data URL of the current screen contents. */
  const capture = useCallback(async (): Promise<string> => {
    const stream = await ensureStream();

    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();

    // One frame needs to land before the canvas has anything to copy.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read the screen.");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    video.pause();
    video.srcObject = null;

    return canvas.toDataURL("image/jpeg", 0.82);
  }, [ensureStream]);

  return { capture, release };
}

/** Phrases that mean "look at my screen" rather than "answer from memory". */
const SCREEN_INTENT =
  /\b(screen|screenshot|display|monitor|this page|what(?:'s| is) on (?:my |the )?screen|read (?:my |the )?screen|look at (?:my |the )?screen)\b/i;

export function wantsScreen(text: string): boolean {
  return SCREEN_INTENT.test(text);
}

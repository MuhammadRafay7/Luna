"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal typing for the vendor-prefixed Web Speech API. */
export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onspeechend: (() => void) | null;
};

type Ctor = new () => SpeechRecognitionLike;

export function speechRecognitionCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, Ctor | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Speaks text using Luna's server-side TTS voice, falling back to the
 * browser's built-in synthesis if the endpoint is unavailable.
 * Supports instant stop for barge-in and audio analysis hooks for waveform animation.
 */
export function useSpeaker() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resolveInFlightRef = useRef<(() => void) | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (resolveInFlightRef.current) {
      resolveInFlightRef.current();
      resolveInFlightRef.current = null;
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string): Promise<void> => {
      const body = text.trim();
      if (!body) return;
      stop();
      setSpeaking(true);

      try {
        const res = await fetch("/api/luna/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: body }),
        });
        if (!res.ok) throw new Error("tts unavailable");

        const { dataUrl } = (await res.json()) as { dataUrl: string };
        await new Promise<void>((resolve) => {
          resolveInFlightRef.current = resolve;
          const audio = new Audio();
          audio.crossOrigin = "anonymous";
          audio.src = dataUrl;
          audioRef.current = audio;

          // Wire up analyser if AudioContext is available
          try {
            const AudioContextClass =
              window.AudioContext ??
              (window as unknown as { webkitAudioContext: typeof AudioContext })
                .webkitAudioContext;
            if (!audioCtxRef.current) {
              audioCtxRef.current = new AudioContextClass();
            }
            const ctx = audioCtxRef.current;
            if (ctx.state === "suspended") {
              void ctx.resume();
            }
            const source = ctx.createMediaElementSource(audio);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            analyserRef.current = analyser;
            source.connect(analyser);
            analyser.connect(ctx.destination);
          } catch {
            // AudioContext connection might fail if element is already connected or restricted
          }

          const done = () => {
            if (resolveInFlightRef.current === resolve) {
              resolveInFlightRef.current = null;
            }
            resolve();
          };

          audio.onended = done;
          audio.onerror = done;
          void audio.play().catch(done);
        });
      } catch {
        // Server voice unavailable — use the browser's own synthesis.
        await new Promise<void>((resolve) => {
          resolveInFlightRef.current = resolve;
          if (typeof window === "undefined" || !("speechSynthesis" in window)) {
            resolve();
            return;
          }
          const utter = new SpeechSynthesisUtterance(body);
          const done = () => {
            if (resolveInFlightRef.current === resolve) {
              resolveInFlightRef.current = null;
            }
            resolve();
          };
          utter.onend = done;
          utter.onerror = done;
          window.speechSynthesis.speak(utter);
        });
      } finally {
        audioRef.current = null;
        resolveInFlightRef.current = null;
        setSpeaking(false);
      }
    },
    [stop],
  );

  const getOutputFrequencyData = useCallback((outArray: Uint8Array<ArrayBuffer>): void => {
    if (analyserRef.current && speaking) {
      analyserRef.current.getByteFrequencyData(outArray);
    } else {
      outArray.fill(0);
    }
  }, [speaking]);

  useEffect(() => stop, [stop]);

  return { speak, stop, speaking, getOutputFrequencyData };
}

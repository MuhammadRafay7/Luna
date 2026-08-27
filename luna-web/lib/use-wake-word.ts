"use client";

import { useEffect, useRef } from "react";
import { speechRecognitionCtor, type SpeechRecognitionLike } from "./use-speech";

/**
 * Always-on wake-word listener: "Luna, play some jazz" fires without any click.
 *
 * Only one SpeechRecognition session can run reliably per tab, so this must be
 * disabled whenever full voice mode is open — that screen owns the microphone.
 *
 * Nothing is transmitted while idle: recognition runs in the browser and only
 * the text after the wake word is ever sent to Luna.
 */

// "luna", "hey luna", "ok luna" — then the actual instruction.
const WAKE = /(?:^|\b)(?:hey\s+|ok(?:ay)?\s+)?lu[nm]a[\s,:-]+(.{2,})$/i;

/** Commands shorter than this are almost always mis-hearings. */
const MIN_COMMAND_CHARS = 3;

export function useWakeWord({
  enabled,
  onWake,
}: {
  enabled: boolean;
  onWake: (command: string) => void;
}) {
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const onWakeRef = useRef(onWake);
  const firedRef = useRef<string>("");

  // Keep the callback fresh without restarting recognition on every render.
  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  useEffect(() => {
    if (!enabled) return;

    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;

    let stopped = false;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = false;
    r.lang = navigator.language || "en-US";

    r.onresult = (e) => {
      // Only inspect results added since the last event.
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const said = String(e.results[i][0]?.transcript ?? "").trim();
        if (!said) continue;

        const match = said.match(WAKE);
        if (!match) continue;

        const command = match[1].trim().replace(/[.,!?]+$/, "");
        if (command.length < MIN_COMMAND_CHARS) continue;

        // Guard against the same phrase firing twice from overlapping results.
        const key = command.toLowerCase();
        if (key === firedRef.current) continue;
        firedRef.current = key;
        setTimeout(() => {
          if (firedRef.current === key) firedRef.current = "";
        }, 4000);

        onWakeRef.current(command);
      }
    };

    r.onerror = () => {
      // no-speech / aborted are routine in an always-on listener.
    };

    r.onend = () => {
      if (stopped) return;
      // Chrome ends continuous sessions periodically; restart to stay awake.
      try {
        r.start();
      } catch {
        // Racing a pending start — the next onend retries.
      }
    };

    recogRef.current = r;
    try {
      r.start();
    } catch {
      // Another session is still closing; onend will restart it.
    }

    return () => {
      stopped = true;
      try {
        r.abort();
      } catch {
        // Already torn down.
      }
      recogRef.current = null;
    };
  }, [enabled]);
}

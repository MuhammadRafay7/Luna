"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  Volume2,
  Sparkles,
  Pause,
  Play,
  X,
  Radio,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import {
  speechRecognitionCtor,
  useSpeaker,
  type SpeechRecognitionLike,
} from "@/lib/use-speech";
import { useVAD } from "@/lib/use-vad";
import { openPendingTab } from "@/lib/open-tab";
import {
  parseActions,
  resolveActionUrl,
  stripActions,
  type LunaAction,
} from "@/lib/actions";
import { LunaLogo } from "./LunaLogo";

type Phase = "listening" | "committing" | "thinking" | "speaking" | "paused";

const PHASE_DETAILS: Record<
  Phase,
  { label: string; icon: React.ReactNode; color: string }
> = {
  listening: {
    label: "Listening…",
    icon: <Mic className="size-3.5 animate-pulse" />,
    color: "var(--accent)",
  },
  committing: {
    label: "Heard you",
    icon: <CheckCircle2 className="size-3.5" />,
    color: "var(--ok)",
  },
  thinking: {
    label: "Thinking…",
    icon: <Sparkles className="size-3.5 animate-spin" />,
    color: "var(--tool)",
  },
  speaking: {
    label: "Luna Speaking",
    icon: <Volume2 className="size-3.5" />,
    color: "var(--accent-hover)",
  },
  paused: {
    label: "Paused",
    icon: <Pause className="size-3.5" />,
    color: "var(--text-faint)",
  },
};

type Props = {
  busy: boolean;
  replyText: string;
  replyId: string | null;
  onSend: (text: string) => void;
  onInterrupt: () => void;
  onClose: () => void;
};

export function VoiceMode({
  busy,
  replyText,
  replyId,
  onSend,
  onInterrupt,
  onClose,
}: Props) {
  const { speak, stop: stopSpeaking, speaking, getOutputFrequencyData } = useSpeaker();

  const [phase, setPhase] = useState<Phase>("listening");
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [recentExchanges, setRecentExchanges] = useState<
    Array<{ role: "user" | "luna"; text: string; id: string }>
  >([]);

  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const phaseRef = useRef<Phase>("listening");
  const spokenRef = useRef<string | null>(null);
  // An action Luna requested that the browser refused to auto-open.
  const [pendingAction, setPendingAction] = useState<LunaAction | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothedBarsRef = useRef<number[]>(new Array(36).fill(0));

  const setPhaseSafe = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // ---- Speech Recognition -------------------------------------------------
  const startListening = useCallback(() => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;

    recogRef.current?.abort();

    const r = new Ctor();
    r.continuous = false;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";

    r.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript;
        if (res.isFinal) final += text;
        else interim += text;
      }

      setInterimText(interim);
      if (final) {
        setFinalText((prev) => (prev ? `${prev} ${final}` : final));
        setInterimText("");
      }
    };

    r.onerror = () => {
      // Non-fatal recognition glitches
    };

    r.onend = () => {
      // If we are still supposed to be listening and VAD hasn't fired commit, restart
      if (phaseRef.current === "listening") {
        try {
          r.start();
        } catch {
          // Already active
        }
      }
    };

    recogRef.current = r;
    setPhaseSafe("listening");
    try {
      r.start();
    } catch {
      // Retry
    }
  }, [setPhaseSafe]);

  // Commit and send speech
  const commitSpeech = useCallback(() => {
    setPhaseSafe("committing");

    // Force recognition stop to flush pending final result
    try {
      recogRef.current?.stop();
    } catch {
      // Ignored
    }

    setTimeout(() => {
      const fullUtterance = (finalText + " " + interimText).trim();
      if (fullUtterance) {
        setRecentExchanges((prev) => [
          ...prev.slice(-3),
          { role: "user", text: fullUtterance, id: `user-${Date.now()}` },
        ]);
        setPhaseSafe("thinking");
        onSend(fullUtterance);
      } else {
        setPhaseSafe("listening");
      }
      setFinalText("");
      setInterimText("");
    }, 120);
  }, [finalText, interimText, onSend, setPhaseSafe]);

  // ---- VAD Integration ----------------------------------------------------
  const handleSpeechEnd = useCallback(() => {
    if (phaseRef.current === "listening") {
      commitSpeech();
    }
  }, [commitSpeech]);

  const handleBargeIn = useCallback(() => {
    if (phaseRef.current === "speaking" || speaking) {
      stopSpeaking();
      onInterrupt();
      setFinalText("");
      setInterimText("");
      startListening();
    }
  }, [onInterrupt, speaking, startListening, stopSpeaking]);

  const vad = useVAD({
    enabled: phase === "listening",
    speaking: phase === "speaking" || speaking,
    onSpeechEnd: handleSpeechEnd,
    onBargeIn: handleBargeIn,
    silenceTimeoutMs: 900,
    minUtteranceMs: 350,
  });

  // Start listening on mount
  useEffect(() => {
    startListening();
    return () => {
      recogRef.current?.abort();
      recogRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Speak Luna's Replies -----------------------------------------------
  useEffect(() => {
    if (!replyId || !replyText.trim()) return;
    if (spokenRef.current === replyId) return;
    if (phaseRef.current === "paused") return;

    spokenRef.current = replyId;
    recogRef.current?.abort();
    setPhaseSafe("speaking");

    const cleanSpoken = stripActions(replyText);

    setRecentExchanges((prev) => [
      ...prev.slice(-3),
      { role: "luna", text: cleanSpoken, id: `luna-${replyId}` },
    ]);

    const { actions } = parseActions(replyText);

    void (async () => {
      await speak(cleanSpoken);

      // Hands-free: try to open what she asked for. Popup blockers reject
      // window.open outside a user gesture, and speaking has taken us well
      // past ours — so when it's refused, surface a button to tap instead.
      if (actions.length > 0) {
        const action = actions[0];
        try {
          const url = await resolveActionUrl(action);
          // No user gesture is in scope here (speech has long finished), so a
          // blocker may refuse. openPendingTab reports that honestly.
          const pending = openPendingTab();
          if (pending.ok) pending.settle(url);
          else setPendingAction(action);
        } catch {
          setPendingAction(action);
        }
      }

      if (phaseRef.current === "speaking") {
        startListening();
      }
    })();
  }, [replyId, replyText, speak, setPhaseSafe, startListening]);

  // Sync turn busy state
  useEffect(() => {
    if (busy && phaseRef.current === "listening") {
      setPhaseSafe("thinking");
    }
  }, [busy, setPhaseSafe]);

  // ---- Audio Waveform Visualizer Canvas -----------------------------------
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const outBuf = new Uint8Array(36);

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const numBars = 36;
      const barWidth = 4;
      const gap = 5;
      const totalWidth = numBars * (barWidth + gap) - gap;
      const startX = (w - totalWidth) / 2;
      const centerY = h / 2;

      let freqData: Uint8Array;
      let barColor = "rgba(139, 155, 240, 0.85)";

      if (phase === "speaking") {
        getOutputFrequencyData(outBuf);
        freqData = outBuf;
        barColor = "rgba(91, 110, 225, 0.9)";
      } else if (phase === "listening") {
        freqData = vad.getFreqData();
        barColor = "rgba(139, 155, 240, 0.85)";
      } else if (phase === "committing") {
        freqData = new Uint8Array(numBars).fill(70);
        barColor = "rgba(63, 143, 95, 0.9)";
      } else if (phase === "thinking") {
        const t = Date.now() / 250;
        const fake = new Uint8Array(numBars);
        for (let i = 0; i < numBars; i++) {
          fake[i] = Math.sin(t + i * 0.3) * 30 + 40;
        }
        freqData = fake;
        barColor = "rgba(224, 169, 74, 0.85)";
      } else {
        freqData = new Uint8Array(numBars).fill(4);
        barColor = "rgba(154, 148, 140, 0.4)";
      }

      // Smooth decay filter
      for (let i = 0; i < numBars; i++) {
        const target = (freqData[i] || 0) / 255;
        smoothedBarsRef.current[i] +=
          (target - smoothedBarsRef.current[i]) * 0.28;
      }

      // Render mirrored centered waveform bars
      for (let i = 0; i < numBars; i++) {
        const x = startX + i * (barWidth + gap);
        const energy = smoothedBarsRef.current[i] ?? 0;
        const barHeight = Math.max(4, energy * (h * 0.78));

        ctx.fillStyle = barColor;
        ctx.beginPath();
        // Rounded bar
        ctx.roundRect(
          x,
          centerY - barHeight / 2,
          barWidth,
          barHeight,
          barWidth / 2,
        );
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [phase, vad, getOutputFrequencyData]);

  // Controls
  const togglePause = useCallback(() => {
    if (phaseRef.current === "paused") {
      startListening();
      return;
    }
    stopSpeaking();
    if (busy) onInterrupt();
    recogRef.current?.abort();
    setPhaseSafe("paused");
  }, [busy, onInterrupt, startListening, stopSpeaking, setPhaseSafe]);

  const close = useCallback(() => {
    recogRef.current?.abort();
    stopSpeaking();
    onClose();
  }, [onClose, stopSpeaking]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, togglePause]);

  const currentDisplay =
    phase === "speaking"
      ? stripActions(replyText).slice(0, 240)
      : finalText || interimText || "Speak freely… Luna is listening.";

  const details = PHASE_DETAILS[phase];

  return (
    <div
      className="luna-aurora fixed inset-0 z-50 flex flex-col items-center justify-between px-6 py-8 backdrop-blur-2xl"
      style={{
        background:
          "radial-gradient(ellipse at 50% 30%, var(--bg-raised), var(--bg))",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Hands-free voice conversation"
    >
      {/* Header controls */}
      <div className="flex w-full max-w-2xl items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-xl transition-transform hover:scale-105">
            <LunaLogo size={24} glow />
          </div>
          <span className="text-sm font-semibold tracking-tight">Luna Voice</span>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium backdrop-blur-md"
            style={{
              background: "var(--bg-hover)",
              color: details.color,
              border: "1px solid var(--border)",
            }}
          >
            {details.icon}
            <span>{details.label}</span>
          </div>

          <button
            type="button"
            onClick={close}
            aria-label="Close voice mode"
            className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Center content: Turn History + Waveform + Live Transcript */}
      <div className="flex w-full max-w-xl flex-1 flex-col items-center justify-center py-6">
        {/* Recent exchanges scrollback */}
        {recentExchanges.length > 0 && (
          <div className="mb-8 flex w-full flex-col gap-2.5 opacity-60 transition-opacity hover:opacity-100">
            {recentExchanges.map((ex) => (
              <div
                key={ex.id}
                className={`rounded-xl px-3.5 py-2 text-xs leading-relaxed ${
                  ex.role === "user"
                    ? "ml-auto max-w-[80%] text-right"
                    : "mr-auto max-w-[80%]"
                }`}
                style={{
                  background:
                    ex.role === "user"
                      ? "var(--bubble-user)"
                      : "var(--bg-sunken)",
                  color: "var(--text)",
                }}
              >
                <span className="font-semibold opacity-70">
                  {ex.role === "user" ? "You: " : "Luna: "}
                </span>
                {ex.text}
              </div>
            ))}
          </div>
        )}

        {/* Live Audio Waveform, seated in a breathing brand halo */}
        <div className="relative my-6 flex h-56 w-full items-center justify-center">
          {/* Soft field of light — scales with the phase, not the frame rate. */}
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-full transition-all duration-500"
            style={{
              width: 340,
              height: 340,
              background: "var(--grad-soft)",
              filter: "blur(46px)",
              opacity: phase === "paused" ? 0.25 : phase === "speaking" ? 0.95 : 0.6,
              transform: `scale(${phase === "speaking" ? 1.12 : 1})`,
            }}
          />

          {/* Containing ring — dashed and turning only while she works. */}
          <div
            aria-hidden
            className={`pointer-events-none absolute rounded-full ${
              phase === "thinking" || phase === "speaking" ? "luna-orbit" : ""
            }`}
            style={{
              width: 260,
              height: 260,
              border: "1px solid var(--accent)",
              opacity: phase === "paused" ? 0.1 : 0.28,
            }}
          />

          <canvas
            ref={canvasRef}
            width={380}
            height={120}
            className="relative z-10 w-full max-w-sm"
          />
        </div>

        {/* Live Transcript & Firming-up Text */}
        <div className="mt-4 min-h-16 text-center">
          <p
            className="text-lg font-medium leading-relaxed tracking-tight transition-all duration-150"
            style={{ color: "var(--text)" }}
          >
            {phase === "speaking" ? (
              currentDisplay
            ) : (
              <>
                <span>{finalText}</span>
                {finalText && interimText ? " " : ""}
                <span className="italic opacity-50">{interimText}</span>
                {!finalText && !interimText && (
                  <span className="text-sm font-normal opacity-40">
                    Listening for your voice…
                  </span>
                )}
              </>
            )}
          </p>
        </div>

        {vad.error && (
          <div
            className="luna-glass mt-4 max-w-md rounded-2xl px-4 py-3 text-center"
            style={{ borderColor: "var(--danger)" }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--danger)" }}>
              {/permission|denied|not-allowed/i.test(vad.error)
                ? "Luna can't hear you"
                : "Microphone problem"}
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {/permission|denied|not-allowed/i.test(vad.error) ? (
                <>
                  Microphone access is blocked for this page. Click the crossed-out
                  mic in the address bar, choose <strong>Allow</strong>, then reload.
                </>
              ) : (
                vad.error
              )}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="luna-pill mt-2.5 px-4 py-1.5 text-xs font-semibold"
              style={{ background: "var(--grad-brand)", color: "var(--accent-text)" }}
            >
              Reload
            </button>
          </div>
        )}
      </div>

      {pendingAction && (
        <button
          type="button"
          onClick={async () => {
            try {
              const url = await resolveActionUrl(pendingAction);
              window.open(url, "_blank", "noopener,noreferrer");
              setPendingAction(null);
            } catch {
              setPendingAction(null);
            }
          }}
          className="mb-4 flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-transform hover:-translate-y-0.5"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          <ExternalLink className="size-4" />
          {pendingAction.type === "play" ? "Play" : "Open"} {pendingAction.label}
        </button>
      )}

      {/* Bottom controls */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePause}
            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold tracking-wide transition-all hover:scale-105 active:scale-95"
            style={{
              background:
                phase === "paused" ? "var(--accent)" : "var(--bg-hover)",
              color:
                phase === "paused"
                  ? "var(--accent-text)"
                  : "var(--text)",
              boxShadow: "var(--shadow)",
            }}
          >
            {phase === "paused" ? (
              <>
                <Play className="size-3.5" /> Resume
              </>
            ) : phase === "speaking" ? (
              <>
                <Radio className="size-3.5" /> Interrupt
              </>
            ) : (
              <>
                <Pause className="size-3.5" /> Pause
              </>
            )}
          </button>

          <button
            type="button"
            onClick={close}
            className="flex items-center gap-2 rounded-full border px-5 py-2.5 text-xs font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{
              borderColor: "var(--border)",
              color: "var(--text-muted)",
            }}
          >
            End Conversation
          </button>
        </div>

        <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          Automatic voice activity detection active · Speak anytime to barge-in · Esc to exit
        </p>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  AudioLines,
  Camera,
  Mic,
  Paperclip,
  Square,
  X,
} from "lucide-react";
import { CameraCapture } from "./CameraCapture";
import { ModelPicker } from "./ModelPicker";

type Props = {
  busy: boolean;
  disabled: boolean;
  statusLine: string;
  onSend: (text: string, images: string[]) => void;
  onInterrupt: () => void;
  onAttachImage: (dataUrl: string) => Promise<void>;
  onVoiceMode: () => void;
  listModels: () => Promise<{
    current: string;
    providers: { slug: string; name: string; models: string[] }[];
  }>;
  setModel: (model: string) => Promise<void>;
};

/** Minimal typing for the vendor-prefixed Web Speech API. */
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export function Composer({
  busy,
  disabled,
  statusLine,
  onSend,
  onInterrupt,
  onAttachImage,
  onVoiceMode,
  listModels,
  setModel,
}: Props) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
  }, [text]);

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    setSpeechSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const submit = useCallback(() => {
    const body = text.trim();
    if (!body || busy || disabled) return;
    onSend(body, images);
    setText("");
    setImages([]);
  }, [busy, disabled, images, onSend, text]);

  const attach = useCallback(
    async (dataUrl: string) => {
      setImages((prev) => [...prev, dataUrl]);
      await onAttachImage(dataUrl);
    },
    [onAttachImage],
  );

  const toggleVoice = useCallback(() => {
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    const w = window as unknown as Record<string, new () => SpeechRecognitionLike>;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;

    const r = new Ctor();
    r.continuous = false;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";

    r.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setText(transcript);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);

    recogRef.current = r;
    setListening(true);
    r.start();
  }, [listening]);

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      for (const item of Array.from(e.clipboardData.items)) {
        if (!item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = () => void attach(String(reader.result));
        reader.readAsDataURL(file);
      }
    },
    [attach],
  );

  const onPickFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      for (const file of Array.from(e.target.files ?? [])) {
        const reader = new FileReader();
        reader.onload = () => void attach(String(reader.result));
        reader.readAsDataURL(file);
      }
      e.target.value = "";
    },
    [attach],
  );

  return (
    <>
      {cameraOpen && (
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={async (dataUrl) => {
            setCameraOpen(false);
            await attach(dataUrl);
          }}
        />
      )}

      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        {statusLine && (
          <div className="mb-1.5 px-1 text-xs" style={{ color: "var(--text-faint)" }}>
            {statusLine}
          </div>
        )}

        <div
          className="luna-composer luna-glass-strong luna-edge-lit rounded-[26px] transition-all"
          style={{
            // Lifted well clear of the page so it reads as a floating control
            // rather than a panel painted onto the background.
            boxShadow:
              "0 18px 50px -20px rgb(0 0 0 / 0.55), 0 2px 8px -3px rgb(0 0 0 / 0.3)",
          }}
        >
          {images.length > 0 && (
            <div
              className="flex flex-wrap gap-2 border-b p-2.5"
              style={{ borderColor: "var(--border)" }}
            >
              {images.map((src, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt="Attachment"
                    className="size-16 rounded-xl border object-cover shadow-sm"
                    style={{ borderColor: "var(--border)" }}
                  />
                  <button
                    type="button"
                    onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                    aria-label="Remove attachment"
                    className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full text-xs shadow-sm transition-transform hover:scale-110"
                    style={{ background: "var(--text)", color: "var(--bg)" }}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            disabled={disabled}
            placeholder={disabled ? "Connecting to Luna…" : "Message Luna…"}
            className="w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-sm outline-none placeholder:opacity-50"
            style={{ color: "var(--text)", maxHeight: 240 }}
          />

          <div className="flex items-center gap-1.5 px-3 pb-2.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={onPickFiles}
            />

            <IconButton
              label="Attach image"
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
            >
              <Paperclip className="size-4" />
            </IconButton>

            <IconButton
              label="Take a photo"
              onClick={() => setCameraOpen(true)}
              disabled={disabled}
            >
              <Camera className="size-4" />
            </IconButton>

            {speechSupported && (
              <>
                <IconButton
                  label={listening ? "Stop dictation" : "Dictate message"}
                  onClick={toggleVoice}
                  disabled={disabled}
                  active={listening}
                >
                  <Mic className="size-4" />
                </IconButton>
                <IconButton
                  label="Hands-free voice mode"
                  onClick={onVoiceMode}
                  disabled={disabled}
                >
                  <AudioLines className="size-4" />
                </IconButton>
              </>
            )}

            <div className="mx-1 h-4 w-px" style={{ background: "var(--border)" }} />

            <ModelPicker listModels={listModels} setModel={setModel} />

            <div className="ml-auto">
              {busy ? (
                <button
                  type="button"
                  onClick={onInterrupt}
                  className="flex size-8 items-center justify-center rounded-xl transition-transform hover:scale-105 active:scale-95"
                  style={{ background: "var(--bg-hover)", color: "var(--text)" }}
                  aria-label="Stop generating"
                >
                  <Square className="size-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!text.trim() || disabled}
                  className="flex size-8 items-center justify-center rounded-xl transition-all hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-30"
                  style={{
                    background: "var(--grad-brand)",
                    color: "var(--accent-text)",
                    boxShadow: "var(--glow)",
                  }}
                  aria-label="Send message"
                >
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-2 text-center text-[11px]" style={{ color: "var(--text-faint)" }}>
          Luna can run commands and edit workspace files. Enter to send, Shift+Enter for new line.
        </p>
      </div>
    </>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex size-8 items-center justify-center rounded-xl transition-colors hover:bg-black/5 active:scale-95 disabled:opacity-30 dark:hover:bg-white/5"
      style={{
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-muted)",
      }}
    >
      {children}
    </button>
  );
}

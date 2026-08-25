"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VADOptions = {
  /** Whether VAD is actively listening for user speech */
  enabled: boolean;
  /** Whether assistant is currently speaking (enables barge-in detection) */
  speaking?: boolean;
  /** Callback fired when speech starts */
  onSpeechStart?: () => void;
  /** Callback fired when user has finished speaking */
  onSpeechEnd?: () => void;
  /** Callback fired when user interrupts while assistant is speaking */
  onBargeIn?: () => void;
  /** Silence duration in ms to commit speech (default 900ms) */
  silenceTimeoutMs?: number;
  /** Minimum speech duration in ms to count as utterance (default 350ms) */
  minUtteranceMs?: number;
  /** Maximum utterance duration in ms before hard cut (default 30000ms) */
  maxUtteranceMs?: number;
};

export type VADState = {
  isSpeaking: boolean;
  rms: number;
  noiseFloor: number;
  freqData: Uint8Array<ArrayBuffer>;
  error: string | null;
};

const DEFAULT_SILENCE_TIMEOUT = 900;
const DEFAULT_MIN_UTTERANCE = 350;
const DEFAULT_MAX_UTTERANCE = 30000;
const CALIBRATION_DURATION_MS = 500;
const SPEECH_START_CONSECUTIVE_FRAMES = 3;
const BARGE_IN_CONSECUTIVE_FRAMES = 15; // ~250ms at 60fps

function calculateRMS(buffer: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const normalized = (buffer[i] - 128) / 128;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / buffer.length);
}

function calculateMedian(arr: number[]): number {
  if (arr.length === 0) return 0.01;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function useVAD({
  enabled,
  speaking = false,
  onSpeechStart,
  onSpeechEnd,
  onBargeIn,
  silenceTimeoutMs = DEFAULT_SILENCE_TIMEOUT,
  minUtteranceMs = DEFAULT_MIN_UTTERANCE,
  maxUtteranceMs = DEFAULT_MAX_UTTERANCE,
}: VADOptions) {
  const [rms, setRms] = useState(0);
  const [noiseFloor, setNoiseFloor] = useState(0.01);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const freqDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(36) as Uint8Array<ArrayBuffer>);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // VAD state trackers
  const isSpeakingRef = useRef(false);
  const consecutiveActiveFramesRef = useRef(0);
  const consecutiveBargeInFramesRef = useRef(0);
  const speechStartTimeRef = useRef<number | null>(null);
  const lastActiveTimeRef = useRef<number | null>(null);
  const calibrationSamplesRef = useRef<number[]>([]);
  const calibrationStartRef = useRef<number>(Date.now());
  const noiseFloorRef = useRef(0.01);

  const callbacksRef = useRef({ onSpeechStart, onSpeechEnd, onBargeIn });
  useEffect(() => {
    callbacksRef.current = { onSpeechStart, onSpeechEnd, onBargeIn };
  });

  const resetCalibration = useCallback(() => {
    calibrationSamplesRef.current = [];
    calibrationStartRef.current = Date.now();
    consecutiveActiveFramesRef.current = 0;
    consecutiveBargeInFramesRef.current = 0;
    speechStartTimeRef.current = null;
    lastActiveTimeRef.current = null;
    isSpeakingRef.current = false;
    setIsSpeaking(false);
  }, []);

  // Initialize Web Audio graph
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        const AudioContextClass =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AudioContextClass();
        audioCtxRef.current = ctx;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;

        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);

        const timeBuf = new Uint8Array(analyser.fftSize);
        const freqBuf = new Uint8Array(analyser.frequencyBinCount);

        resetCalibration();

        const processFrame = () => {
          if (cancelled) return;

          analyser.getByteTimeDomainData(timeBuf);
          analyser.getByteFrequencyData(freqBuf);

          // Sample down to 36 bars for waveform rendering
          const barCount = 36;
          const step = Math.floor(freqBuf.length / barCount) || 1;
          const sampled = new Uint8Array(barCount);
          for (let i = 0; i < barCount; i++) {
            sampled[i] = freqBuf[i * step] ?? 0;
          }
          freqDataRef.current = sampled;

          const currentRms = calculateRMS(timeBuf);
          setRms(currentRms);

          const now = Date.now();

          // 1. Calibration phase (first 500ms)
          if (now - calibrationStartRef.current < CALIBRATION_DURATION_MS) {
            calibrationSamplesRef.current.push(currentRms);
            const median = calculateMedian(calibrationSamplesRef.current);
            noiseFloorRef.current = Math.max(median, 0.005);
            setNoiseFloor(noiseFloorRef.current);
            rafRef.current = requestAnimationFrame(processFrame);
            return;
          }

          const threshold = Math.max(noiseFloorRef.current * 2.5, 0.015);
          const bargeInThreshold = Math.max(noiseFloorRef.current * 4.0, 0.045);

          // 2. Barge-in detection while assistant is speaking
          if (speaking) {
            if (currentRms > bargeInThreshold) {
              consecutiveBargeInFramesRef.current++;
              if (consecutiveBargeInFramesRef.current >= BARGE_IN_CONSECUTIVE_FRAMES) {
                callbacksRef.current.onBargeIn?.();
                consecutiveBargeInFramesRef.current = 0;
                resetCalibration();
              }
            } else {
              consecutiveBargeInFramesRef.current = Math.max(
                0,
                consecutiveBargeInFramesRef.current - 1,
              );
            }
            rafRef.current = requestAnimationFrame(processFrame);
            return;
          }

          // 3. User Listening VAD
          if (!enabled) {
            rafRef.current = requestAnimationFrame(processFrame);
            return;
          }

          if (currentRms > threshold) {
            consecutiveActiveFramesRef.current++;
            lastActiveTimeRef.current = now;

            if (
              !isSpeakingRef.current &&
              consecutiveActiveFramesRef.current >= SPEECH_START_CONSECUTIVE_FRAMES
            ) {
              isSpeakingRef.current = true;
              speechStartTimeRef.current = now;
              setIsSpeaking(true);
              callbacksRef.current.onSpeechStart?.();
            }
          } else {
            consecutiveActiveFramesRef.current = 0;
          }

          // Check for speech completion
          if (isSpeakingRef.current && lastActiveTimeRef.current != null) {
            const silenceDuration = now - lastActiveTimeRef.current;
            const totalDuration = speechStartTimeRef.current
              ? now - speechStartTimeRef.current
              : 0;

            const isSilenceTimeout = silenceDuration >= silenceTimeoutMs;
            const isHardCapped = totalDuration >= maxUtteranceMs;

            if (isSilenceTimeout || isHardCapped) {
              // Only trigger if total utterance >= minUtteranceMs
              if (totalDuration >= minUtteranceMs) {
                callbacksRef.current.onSpeechEnd?.();
              }
              isSpeakingRef.current = false;
              speechStartTimeRef.current = null;
              lastActiveTimeRef.current = null;
              setIsSpeaking(false);
            }
          }

          rafRef.current = requestAnimationFrame(processFrame);
        };

        rafRef.current = requestAnimationFrame(processFrame);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Microphone access was denied.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void audioCtxRef.current?.close().catch(() => {});
    };
  }, [enabled, speaking, silenceTimeoutMs, minUtteranceMs, maxUtteranceMs, resetCalibration]);

  return {
    rms,
    noiseFloor,
    isSpeaking,
    error,
    getFreqData: () => freqDataRef.current,
    resetCalibration,
  };
}

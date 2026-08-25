# Luna

Luna is a personal AI assistant powered by [Hermes Agent](https://github.com/NousResearch/hermes-agent) and Google Gemini models, running in Docker with a custom Next.js web interface.

Isolated from other Docker work on this machine via the Compose project name `luna` (own network `luna-net`, container `luna`).

## Quick Start

```bash
make up                    # start Hermes container (127.0.0.1:9119)
cd luna-web && pnpm dev    # start web client (127.0.0.1:3210)
make chat                  # interactive terminal chat
```

## Setup

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Configure `.env` (gitignored).
3. `docker compose up -d`

## Architecture & Ports

- **Luna Gateway (Hermes)**: `127.0.0.1:9119` (JSON-RPC WebSocket gateway & management dashboard).
- **Luna Web Client**: `127.0.0.1:3210` (`luna-web` Next.js frontend with hands-free voice VAD, action chips, command palette, and audio waveforms).

## Security Model

Docker here is **blast-radius reduction, not a sandbox.**

- `/var/run/docker.sock` is deliberately NOT mounted.
- Bound strictly to `127.0.0.1` (loopback only, never exposed to LAN).
- Only `./workspace`, `./data`, `./captures` are mounted.
- `cap_drop: ALL` with minimum explicit capabilities for s6-overlay privilege drop (`CHOWN`, `SETUID`, `SETGID`, `DAC_OVERRIDE`, `FOWNER`, `KILL`).
- `mem_limit: 2g` to avoid resource exhaustion on host.

## Voice & Actions

- **Automatic End-of-Speech VAD**: Client-side audio activity meter with baseline calibration and speech-endpoint detection.
- **Barge-in**: Interrupts playback and immediately listens when user speaks over assistant audio.
- **Client Actions**: Triggers structured URL navigations and web launches via `ActionChip`s.

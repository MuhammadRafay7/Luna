# luna-web

A Claude-style chat interface for Luna, replacing the Hermes admin dashboard as
the everyday way to talk to her.

```bash
make web          # dev server  -> http://127.0.0.1:3210
make web-build    # production build
```

The container must be up (`make up`) — this is a frontend only.

## How it connects

Port **8642** advertises an "OpenAI-compatible API" in `docker-compose.yml`, but
nothing listens there. The working surface is the dashboard server on **9119**,
which is also the JSON-RPC/WebSocket gateway Hermes' own desktop and web clients
speak. This app reuses that, so sessions, memory, tools, and streaming all come
from Hermes rather than being reimplemented.

Auth is a three-step chain, and the dashboard password never reaches the browser:

1. `POST /auth/password-login` `{provider:"basic", username, password}` → session cookie.
   Done server-side in `lib/hermes-auth.ts`, which reads credentials from `../.env`.
2. `POST /api/auth/ws-ticket` with that cookie → `{ticket, ttl_seconds}`.
   Single-use, 30-second TTL.
3. Browser opens `ws://127.0.0.1:9119/api/ws?ticket=<ticket>`.

`app/api/luna/ticket/route.ts` exposes only step 3's input, so a fresh ticket is
minted per socket.

## Wire protocol

Newline-delimited JSON-RPC both ways. The server sends `gateway.ready` on accept,
then `method: "event"` frames for everything streaming. Per-token frames are
coalesced server-side, so one `message.delta` may carry several tokens.

RPCs used here:

| Method | Params | Notes |
|---|---|---|
| `session.create` | `{}` | → `{session_id, stored_session_id}` |
| `session.list` | `{}` | → `{sessions:[{id, title, preview, started_at, message_count}]}` |
| `session.resume` | `{session_id: <stored id>}` | → runtime `session_id` + full `messages` |
| `session.delete` | `{session_id}` | |
| `session.interrupt` | `{session_id}` | stop button |
| `prompt.submit` | `{session_id, text}` | |
| `image.attach_bytes` | `{session_id, content_base64, filename}` | next submit picks it up |

Two kinds of session id exist and are **not** interchangeable: `session.list`
returns the *stored* id (`20260825_091230_e91959`), while `session.create` and
`session.resume` return the *runtime* id (`0bdb6d24`). `prompt.submit` wants the
runtime one; `session.resume` wants the stored one.

Events consumed:

```
message.start  message.delta  message.complete
thinking.delta  reasoning.delta
tool.start {tool_id, name, context, args}
tool.complete {tool_id, name, args, duration_s, result:{output, exit_code, error}}
status.update  turn.start  turn.end  turn.error
session.title  sessions.changed
```

`message.complete` also carries `usage` (model, token counts, `context_percent`),
which the UI shows under finished replies.

## Voice

Two separate things, both reachable from the composer and the header:

- **Dictate** (`◔`) fills the message box with what you say, so you can edit before sending.
- **Talk** (`◉`) opens hands-free voice conversation: it listens, sends when you stop
  speaking, plays Luna's spoken reply, then listens again. Space pauses, Esc ends. The
  orb scales with live mic amplitude via an `AnalyserNode`, so you can see it hearing you.

**Output** goes through `POST /api/audio/speak`, which uses Luna's configured TTS
provider — `edge` / `en-US-AriaNeural` by default, which needs no API key and returns
an MP3 data URL. The browser's own `speechSynthesis` is the fallback if that fails.

**Input** uses the browser's Web Speech API, not the server. Hermes exposes
`POST /api/audio/transcribe`, but the default STT provider is *local Whisper*: it
downloads a model and runs on CPU inside a 2 GB container, which took over two minutes
in testing. It is unusable for a live loop on this host. Set `stt.provider` to `groq`
or `openai` (with the matching key) if you want server-side transcription instead —
then the input path can move off the browser.

Because input is browser-side, voice mode needs Chrome or Edge; Firefox has no
`SpeechRecognition`. The UI hides the voice buttons when the API is absent.

## Camera

`getUserMedia` grabs a still from the camera on whichever machine has the browser open.
This is *not* the container's `/dev/video0` passthrough — that device belongs to Luna's
own vision tools, which she drives herself. Captures upload through `image.attach_bytes`
and ride along with the next message.

## Notes

- Runs on port 3210 because 3000 was already taken on this machine.
- The sidebar collapses to an icon rail; the choice persists in `localStorage`.
- Tool calls run without an approval prompt in the current Hermes config — no
  `approval.request` event fires. If you enable approvals, handle that event.

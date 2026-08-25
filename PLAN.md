# Luna Build Plan

Four workstreams for the Luna agent and its web client: automatic end-of-speech
detection, giving the agent the ability to actually open things, a full UI pass
against two Figma kits, and repairing the capabilities that are switched on but
quietly non-functional.

| | |
|---|---|
| Repo | `~/Programing/luna` |
| Client | `luna-web` on `127.0.0.1:3210` |
| Agent | Hermes on `127.0.0.1:9119` |
| Model | `gemini-2.5-flash` |

**Status legend** — `[VERIFIED]` tested live on this machine · `[BROKEN]` confirmed
non-functional · `[UNVERIFIED]` built but never exercised · `[TODO]` to build.

---

## 00 · Ground truth before you start

Everything below was probed directly against the running container. Trust this over
the README, which has drifted.

### Getting running

```bash
make up                    # container (Hermes on 127.0.0.1:9119)
cd luna-web && pnpm dev    # client on 127.0.0.1:3210
make chat                  # terminal chat, useful for isolating UI vs agent bugs
```

### What works

| Capability | State | Evidence |
|---|---|---|
| Chat + streaming | `[VERIFIED]` | `prompt.submit` → `message.delta` → `message.complete` |
| Tool execution | `[VERIFIED]` | `terminal` ran `echo`, exit 0, 0.27s |
| Sessions (list/resume/delete) | `[VERIFIED]` | full transcript hydrates on resume |
| Text-to-speech | `[VERIFIED]` | edge / `en-US-AriaNeural`, returns MP3, no API key |
| Web client auth chain | `[VERIFIED]` | login → ws-ticket → socket |
| Voice loop end-to-end | `[UNVERIFIED]` | never run in a real browser |
| Camera capture | `[UNVERIFIED]` | needs a permission prompt |

### What is switched on but dead

All four appear as `✓ enabled` in `hermes tools list`. None of them can run. This
matters because the model believes it has these tools and will try to use them.

| Toolset | Why it fails | How I checked |
|---|---|---|
| `computer_use` | No display in the container | `check_computer_use_requirements()` → `False`; `$DISPLAY` empty; no `/tmp/.X11-unix` |
| `browser` | Playwright and Chromium absent | `import playwright` → `ModuleNotFoundError` |
| `web` (search) | No provider key and no keyless fallback | Tavily/Exa/Firecrawl unset; `_ddgs_package_importable()` → `False` |
| `stt` | Defaults to local Whisper on CPU | `/api/audio/transcribe` exceeded 2 minutes |

> **Model quota.** The current API key returns `429 RESOURCE_EXHAUSTED` for
> `gemini-3.5-flash`. Working models on this key: `gemini-2.5-flash`,
> `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite`. Luna is on `gemini-2.5-flash`.
> If replies start failing, check this first — the error surfaces as reply text,
> not as a UI error.

---

## 01 · Voice: automatic end-of-speech

Today you have to hit Pause or End to send. Luna should hear that you've stopped
talking and go.

### Why it behaves that way now

`VoiceMode.tsx` leans on the browser to decide when an utterance ended: it sets
`continuous = false` and waits for a result flagged `isFinal`. Chrome's endpointer is
conservative and inconsistent — with `interimResults` on it will often sit on interim
results, and the `onend` handler restarts recognition before a final ever lands. The
loop stays alive but never commits, so the only way to send is a button.

The fix is to stop asking the browser and decide yourself. The component already opens
a `getUserMedia` stream and runs an `AnalyserNode` for the orb animation — that same
signal is a perfectly good voice-activity detector.

### Build a real VAD

Extract the meter into `lib/use-vad.ts` and have it emit events rather than just a number.

**Algorithm**

1. **Measure.** Per animation frame, take RMS over the time-domain buffer (not peak —
   peak is jumpy and reacts to clicks).
2. **Calibrate.** For the first 500 ms of a listening turn, collect RMS into a noise
   floor (use the median, not the mean — a cough shouldn't set your floor).
3. **Speech start.** Fire when RMS exceeds `max(floor * 2.5, 0.015)` for 3 consecutive
   frames. The absolute minimum stops a silent room from arming on nothing.
4. **Speech end.** Once started, fire when RMS stays under the same threshold for
   **900 ms** continuously. Make this a constant you can tune; 700–1100 ms is the
   usable band.
5. **Guards.** Hard-cap an utterance at 30 s. Ignore utterances shorter than 350 ms
   as noise.
6. **Commit.** On speech end call `recognition.stop()` — that forces Chrome to emit
   its final result, which the existing `onresult` already sends.

> **The key insight.** Don't replace Web Speech — *drive* it. VAD decides *when* the
> utterance is over; Chrome still does the transcription. Calling `stop()` is what
> converts a pending interim result into a final one.

### Barge-in

While Luna is speaking, keep the analyser running. If RMS crosses the speech threshold
for ~250 ms, treat it as an interruption: stop audio playback, call `interrupt()` if a
turn is in flight, and start listening. This is what makes it feel like a conversation
rather than a walkie-talkie.

Watch for the feedback loop — Luna's own voice coming out of the speakers will trip the
detector. Two defences: raise the barge-in threshold well above the listening threshold,
and request `echoCancellation: true` in the `getUserMedia` constraints. On speakers
rather than headphones, expect to tune this.

### Keep the manual controls

Pause and End stay, but demoted to overrides rather than the primary path. Add a visible
state so the user can see the machine agreeing with them: a small *"heard you — sending"*
transition between listening and thinking.

**Files**

| Path | Change |
|---|---|
| `luna-web/lib/use-vad.ts` | new — RMS meter, calibration, `onSpeechStart` / `onSpeechEnd` |
| `luna-web/components/VoiceMode.tsx` | consume VAD; drop reliance on `isFinal`; add barge-in |
| `luna-web/lib/use-speech.ts` | expose a stop that resolves immediately for barge-in |

**Done when**

- You speak, stop, and the message sends within ~1 s with no click.
- Speaking over Luna cuts her off and starts a new turn.
- Silence in a quiet room never sends an empty message.
- A 30-second monologue still commits rather than hanging.

---

## 02 · Actions: open things for real

Ask Luna to open Facebook and she hands you a link. She should open it.

> **Read this before designing anything.** The container cannot open anything on your
> desktop, and no amount of prompting will change that. It has no display, no X11
> socket, no browser binary, and no access to your host session. `computer_use` and
> `browser` are enabled in config but both fail their own capability checks. Luna
> returns a link because a link is genuinely all she can produce.

### The actuator has to be the browser

The web client already runs on your machine, in your session, with a window that can
navigate. That's the thing that can open Facebook. So the agent's job is to express
*intent*, and the client's job is to *act* on it.

**Step A — structured intent from the agent.** Add a skill in `data/skills/` that
teaches Luna to emit a fenced block when the user asks to open, launch, or go to
something:

~~~
```luna-action
{"type": "open_url", "url": "https://facebook.com", "label": "Facebook"}
```
~~~

A skill is the cheapest path — no Python, no image rebuild, and it survives container
recreation because `data/` is a bind mount. If you want it more reliable than prompting,
register a real tool instead (Step C).

**Step B — the client acts.** Parse those blocks out of assistant text before markdown
rendering, strip them from the visible reply, and render an action chip:
*Open Facebook ↗*. Clicking it calls `window.open(url, "_blank", "noopener")`.

> **Popup blockers — the part that will bite you.** Browsers only allow `window.open`
> during a user gesture. Opening automatically when the reply arrives **will be
> blocked**, because that's an async callback, not a click. So the one-click chip is
> not a compromise — it's the only reliable design.
>
> If you want true hands-free (important for voice mode, where clicking defeats the
> point), the workaround is to navigate the current tab via `location.href`, which is
> not gated the same way — but that closes Luna. Better: open a small popup window once
> from a user gesture at session start, and reuse that window handle for subsequent
> navigations.

**Step C — a real tool, if you want it dependable.** Prompt-driven emission will
occasionally be forgotten or malformed. The robust version registers `open_url` as an
actual Hermes tool so the model calls it through the normal tool path and you get a
`tool.start` event on the wire. The client listens for `tool.start` with
`name === "open_url"` and acts on `payload.args.url` — no text parsing at all.

Tool registration lives in `/opt/hermes/tools/`, which is inside the image and will not
survive a rebuild. Check whether Hermes supports a plugin directory under `data/`
(`hermes plugins` exists) — prefer that over editing the image.

**Step D — beyond URLs.** Opening desktop *applications* (not just websites) needs
something running on the host, outside Docker. A tiny local HTTP helper on, say,
`127.0.0.1:7788` that accepts `{"open": "spotify"}` and shells out to `xdg-open`.

> **Security.** That helper is a remote-code-execution surface pointed at your own
> machine. If you build it: bind loopback only, use a strict allow-list of permitted
> targets (never pass user text to a shell), require a shared secret from `.env`, and
> log every invocation. Do not make it generic.

**Files**

| Path | Change |
|---|---|
| `data/skills/open-actions/` | new — teaches the `luna-action` block |
| `luna-web/lib/actions.ts` | new — parse, validate, strip action blocks |
| `luna-web/components/ActionChip.tsx` | new — the clickable open button |
| `luna-web/components/MessageBubble.tsx` | render chips above the reply text |
| `luna-web/lib/use-luna.ts` | optional — surface `open_url` tool events |

**Done when**

- "Open Facebook" produces a chip that opens the site in one click.
- The raw JSON block never appears in the rendered message.
- A malformed or non-http URL is rejected, not opened.
- Voice mode announces the action rather than silently doing nothing.

---

## 03 · UI overhaul

Two Figma kits to work from, proper icons, and a voice screen built on waveforms
instead of a single orb.

> **Do this first — the Figma files are not readable yet.** Both links returned
> *"you don't have edit access to this file."* They're Community files, which are
> read-only until duplicated. To make them usable in a session:
>
> 1. Open each link and click **Open in Figma** / **Duplicate** — it lands in your Drafts.
> 2. Share the *duplicated* file's URL (with a `node-id`) instead of the Community URL.
> 3. Fallback if that still fails: export the key frames as PNG and drop them in the repo.

The kits, and what each is for:

| Kit | Use it for |
|---|---|
| [UI Kit for AI Agent Chat Apps](https://www.figma.com/design/sKRbjNnTXypsdN5XrUeBaA/Figma-UI-Kit-for-AI-Agent-Chat-Apps--Freemium-Version---Community-?node-id=1-613) | Message layout, tool/citation display, sidebar, composer, model picker, attachment states |
| [Voice UI Kit — Waveforms, STT & Transcription](https://www.figma.com/design/miqhqYehEy7sq7YuTxoMfn/Voice-UI-Kit-%E2%80%94-Waveforms--STT---Transcription--FREE---Community-?node-id=0-1) | The entire voice screen: live waveform, transcript treatment, recording states |

### Icons — replace the Unicode glyphs

The current UI draws its icons from characters like `＋ ◉ ◔ ☰ ⟨ ⟩ ×`. They render at
inconsistent weights and sizes across platforms and are the single biggest reason it
reads as generic. Install **lucide-react** (MIT, tree-shakeable, ~1 kB per icon).

```bash
pnpm add lucide-react
```

| Where | Now | Use |
|---|---|---|
| New chat | `＋` | `SquarePen` |
| Attach image | `＋` | `Paperclip` |
| Camera | `◉` | `Camera` |
| Dictate | `◔` | `Mic` |
| Voice mode | `◉` | `AudioLines` |
| Send | `↑` | `ArrowUp` |
| Stop | `■` | `Square` |
| Collapse / expand | `⟨ ⟩` | `PanelLeftClose` / `PanelLeftOpen` |
| Theme | `◐` | `Sun` / `Moon` |
| Delete chat | `×` | `Trash2` |
| Tool: terminal | `▸` | `Terminal` |
| Tool: file | `◈` | `FileText` |
| Tool: web | `◎` | `Globe` |
| Tool: memory | `❖` | `Brain` |

Keep the crescent `☾` — that's Luna's mark, not an icon, and it should stay a glyph.

### Voice screen: waveform, not just an orb

The Voice UI Kit is built around waveforms, and a waveform carries more information than
a pulsing circle — it shows *what* was heard, not just *that* something was heard.

- **Live input bars.** 32–48 bars from `getByteFrequencyData`, mirrored around the centre
  line, smoothed with a decay factor so they fall gracefully rather than strobing.
- **Speaking waveform.** While Luna talks, drive the same bars from an analyser on the
  playback audio, tinted with the accent to distinguish her voice from yours.
- **Live transcript.** Show interim text faint and final text at full contrast, so you can
  watch it firm up. This is the single most reassuring detail in a voice UI.
- **Turn history.** A scrollback of the last few exchanges above the waveform, so voice
  mode isn't amnesiac.
- **Explicit states.** Listening / heard you / thinking / speaking / paused — each with its
  own visual, not just a label swap.

### Chat surface

- **Message actions** on hover: copy, regenerate, edit-and-resend. `message.react` exists
  on the gateway if you want reactions too.
- **Code blocks:** syntax highlighting (Shiki, or highlight.js if bundle size matters), a
  copy button, and language labels.
- **Tool timeline:** group consecutive tool calls into one collapsible unit with total
  elapsed time rather than a stack of separate cards.
- **Scroll affordance:** a "jump to latest" button when scrolled up — the pinning logic
  exists but gives no visual cue.
- **Long threads:** virtualize once threads pass a few hundred messages.
- **Command palette** (`⌘K`): switch chats, start voice, toggle theme, change model.
- **Toasts** for connection loss, TTS failure, delete confirmation — errors currently only
  appear inline or not at all.
- **Streaming skeleton** instead of three dots when a turn starts with a long tool call.

**Done when**

- No Unicode glyph is doing an icon's job.
- Voice mode shows a live waveform and a firming-up transcript.
- Both light and dark themes are checked against the kits, not just light.
- The layout holds at 360 px wide.

---

## 04 · Agent repairs and upgrades

What else is worth doing — ordered by how much capability you get per unit of effort.

### Give her the web back

Luna currently has no live web access at all: no search provider key, and the keyless
fallback package isn't installed. For a personal assistant this is the biggest single
gap — she's answering from training data alone.

```bash
# Option A — keyless, free, install inside the container
docker compose exec luna pip install ddgs

# Option B — better results, needs a free key
# add TAVILY_API_KEY to .env, then: make restart
```

> **Persistence.** A `pip install` inside the container is lost on
> `docker compose up --force-recreate`. For something permanent, either add a small
> `Dockerfile` that layers on the base image, or check whether Hermes' `lazy-packages`
> directory under `data/` is a supported install target — that path is a bind mount and
> would survive.

### Fix or switch off the dead toolsets

Leaving broken tools enabled is worse than disabling them: the model plans around
capabilities it doesn't have, then fails mid-task.

| Toolset | Decision |
|---|---|
| `browser` | Either run `hermes acp --setup-browser` (~400 MB Chromium) **and** raise `MEM_LIMIT` to 4g — Playwright alone wants ~2g and you're capped at 2g today — or `hermes tools disable browser`. |
| `computer_use` | Disable. It cannot work in a container with no display, and pretending otherwise costs you failed turns. |
| `stt` | Set `stt.provider` to `groq` (free tier, `whisper-large-v3-turbo`, fast). That would let voice input move server-side and work in Firefox, which has no Web Speech API. |
| `bfl` / video | Disable unless you're adding the key. |

### Security worth closing

- **The web client has no authentication.** Anything that can reach `:3210` can drive
  Luna — and Luna can run shell commands. It's loopback-bound, so this is about other
  processes and other users on the machine, not the internet. A shared secret in a cookie
  would take twenty minutes.
- **Tools run with no approval prompt.** No `approval.request` event ever fires — she
  executes the moment she decides to. The gateway supports approvals
  (`approval.request` / `approval.respond`). Consider enabling them for `terminal` and
  file writes, with a UI affordance to approve inline.
- **Docs drift.** The README claims `no-new-privileges` is applied; `docker-compose.yml`
  says it's incompatible with this image and removed. The README also describes the
  project name as `hermes-assistant` when it's `luna`. And the compose file advertises an
  OpenAI-compatible API on `8642` that nothing serves. Fix all three before they mislead
  someone.

### Make her feel like Luna

`data/SOUL.md` is still the stock Hermes system prompt — *"You are Hermes Agent, an
intelligent AI assistant created by Nous Research."* You named her Luna; that file is
where she becomes Luna. Voice, defaults, how much she explains, when she asks versus
acts, what she calls you.

Also unexercised, and cheap to turn on:

- **Memory.** `data/memories/` is empty. The toolset is enabled — she just hasn't been
  given anything worth keeping.
- **Skills.** Fourteen packs are installed (github, devops, research, note-taking,
  smart-home…) and none have been used. Worth an evening finding which are real.
- **Cron.** `hermes cron` can schedule autonomous runs — a morning briefing, a nightly
  repo summary.
- **Projects.** `hermes project` gives named multi-folder workspaces, better than
  everything living in one `workspace/`.

### Client robustness

- **No WebSocket reconnect.** `luna-client.ts` reports `closed` and stops. Add exponential
  backoff with a fresh ticket per attempt — tickets are single-use, so a reconnect must
  re-mint.
- **Debounce `sessions.changed`.** It fired three times per turn in testing, and each one
  triggers a full `session.list`.
- **Surface the context meter.** `message.complete` carries `context_percent` and
  `context_max`; show it before a long session silently starts compressing.
- **Handle `turn.error` visibly.** Quota errors currently arrive as ordinary reply text —
  that's how the 429 hid.

### Suggested order

1. Web search, then `SOUL.md` — biggest capability jump for the least work.
2. Disable the dead toolsets in the same pass.
3. Phase 01 (VAD), since voice is the feature you're actually using.
4. Phase 02 (actions), which needs Phase 01's voice loop to be worth it.
5. Phase 03 (UI) last — it's the largest, and it benefits from the Figma files being
   readable first.

---

## Protocol reference

Reverse-engineered from the container and verified live. The fuller version lives in
[`luna-web/README.md`](luna-web/README.md).

**Auth chain**

```
POST /auth/password-login   {provider:"basic", username, password}  -> session cookie
POST /api/auth/ws-ticket    (with cookie)  -> {ticket, ttl_seconds:30}   single-use
WS   ws://127.0.0.1:9119/api/ws?ticket=<ticket>
```

**RPCs**

```
session.create    {}                       -> {session_id, stored_session_id}
session.list      {}                       -> {sessions:[{id,title,preview,started_at,...}]}
session.resume    {session_id: <stored>}   -> {session_id: <runtime>, messages:[...]}
session.interrupt {session_id}
prompt.submit     {session_id, text}
image.attach_bytes {session_id, content_base64, filename}
```

> **The id trap.** Two different session ids exist and are not interchangeable.
> `session.list` returns the *stored* id (`20260825_091230_e91959`); `session.create` and
> `session.resume` return the *runtime* id (`0bdb6d24`). `prompt.submit` wants the runtime
> one, `session.resume` wants the stored one. Mixing them returns `4001 session not found`.

**Events**

```
message.start · message.delta · message.complete
thinking.delta · reasoning.delta
tool.start    {tool_id, name, context, args}
tool.complete {tool_id, name, args, duration_s, result:{output, exit_code, error}}
status.update · turn.start · turn.end · turn.error
session.title · sessions.changed
```

**Audio**

```
POST /api/audio/speak       {text} -> {ok, data_url}   edge TTS, no key needed
POST /api/audio/transcribe  {data_url, mime_type}      local Whisper — too slow here
WS   /api/audio/speak-stream                           streaming PCM, unexplored
```

`speak-stream` is worth a look in Phase 01: it cuts sentences as deltas arrive and streams
PCM immediately, so Luna could begin speaking before she's finished thinking. That would
remove most of the latency in the voice loop.

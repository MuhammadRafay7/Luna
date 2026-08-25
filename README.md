# luna

Nous Research [Hermes Agent](https://github.com/NousResearch/hermes-agent) running in Docker,
powered by the Google Gemini API.

Isolated from other Docker work on this machine via the Compose project name
`hermes-assistant` (own network `hermes-assistant-net`, own container, own lifecycle).
`docker compose down` here touches nothing else.

## Setup

1. Get a Gemini API key: https://aistudio.google.com/apikey
   A Gemini Pro/Ultra *app subscription* is not API access.
2. Put it in `.env` (already gitignored, mode 600).
3. `docker compose up -d`

## Security model — read this

Docker here is **blast-radius reduction, not a sandbox.**

`/var/run/docker.sock` is deliberately NOT mounted. The Hermes image ships `docker-cli`
so the agent can drive the host Docker daemon; mounting the socket lets it launch a
privileged container mounting `/`, which is host root in one step. Leave it out.

Also note the host user is in the `docker` group, which is already root-equivalent
on this machine. The container is a speed bump, not a wall.

Applied hardening:
- `cap_drop: ALL`, `no-new-privileges`
- Port bound to `127.0.0.1` only, not the LAN
- Only `./workspace`, `./data`, `./captures` are writable; the host filesystem is not mounted
- `mem_limit: 2g` (see below)

To let the agent reach more of your files, mount specific directories -- never `/`.

## Resource notes

This machine: 6.8 GB RAM, no GPU, and ~6.2 GB of swap already in use before Hermes
starts. `mem_limit: 2g` keeps the container from pushing the host into swap death.

Browser tools (Playwright + Chromium) want ~2 GB on their own and are best left off
here. Raise `mem_limit` first if you enable them.

## Storage

Docker data stays on the ext4 root partition. It cannot go on `/mnt/newvolume`:
that volume is NTFS-over-FUSE, `chown` fails on it, and overlay2 cannot stack on FUSE.

The image is ~0.95 GB against ~38 GB free, so this is not a constraint.

Bulk media *can* live on the NTFS volume, but snap Docker needs
`sudo snap connect docker:removable-media` first (currently unconnected).

## Camera

`/dev/video0` is passed through. `/dev/video1` also exists on this host and can be
added if it's the one you want.
# Luna

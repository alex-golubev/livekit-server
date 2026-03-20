# LiveKit Server

Voice agent powered by [LiveKit Agents](https://docs.livekit.io/agents/) and Google Gemini, with a full production deployment stack.

## Architecture

```
Browser ↔ LiveKit Server ↔ Agent ↔ Gemini (speech-to-speech)
```

The agent connects to a LiveKit room, waits for a participant, then starts a real-time voice session via Gemini's native audio API. It acts as a language conversation partner — adjusting complexity based on the student's proficiency level.

**Stack:** Node.js, TypeScript, [Effect](https://effect.website), Docker Compose, Caddy, Redis, Prometheus, Grafana.

## Project Structure

```
agent/               TypeScript agent (LiveKit + Gemini)
├── src/
│   ├── agent.ts     Entry point — orchestrates the pipeline
│   ├── config.ts    Environment and participant config
│   ├── gemini.ts    Gemini RealtimeModel instantiation
│   ├── session.ts   Voice session lifecycle
│   ├── prompt.ts    System and greeting prompt builders
│   └── errors.ts    Typed error definitions
├── Dockerfile
└── package.json

deploy/              Production infrastructure
├── compose.yaml     Full stack (LiveKit, Redis, Caddy, monitoring)
├── livekit.yaml     LiveKit server config
├── Caddyfile        Reverse proxy / TLS
├── prometheus.yml   Metrics scrape config
└── grafana/         Dashboards and provisioning

.github/workflows/
├── deploy-agent.yml   Build image → rolling deploy
└── deploy-infra.yml   Sync infra configs → restart services
```

## Local Development

```bash
cd agent
cp .env.example .env   # fill in credentials
pnpm install
pnpm dev
```

Requires a running LiveKit server. For local development, use [LiveKit CLI](https://docs.livekit.io/home/cli/cli-setup/) or the dev compose in the main app repo.

## Testing

```bash
cd agent
pnpm test        # run tests
pnpm typecheck   # type-check without emitting
```

## Deployment

### Prerequisites

- VPS with Docker and Docker Compose
- Domain names for LiveKit and Grafana (with DNS pointing to the server)
- GitHub repo with the following secrets:
  - `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
  - `GHCR_PAT` (GitHub PAT with `write:packages`)

### Setup

1. On the VPS, create the environment file:

```bash
mkdir -p /opt/livekit
nano /opt/livekit/.env
```

2. Fill in all values (see [`deploy/env.example`](deploy/env.example) for reference):

```env
NODE_IP=<server public IP>
LIVEKIT_DOMAIN=livekit.example.com
LIVEKIT_API_KEY=<openssl rand -hex 24>
LIVEKIT_API_SECRET=<openssl rand -hex 24>
GRAFANA_DOMAIN=grafana.example.com
GF_SECURITY_ADMIN_PASSWORD=<password>
GOOGLE_API_KEY=<Google AI Studio key>
```

3. Edit `deploy/livekit.yaml` — replace `<API_KEY>`, `<API_SECRET>`, and `<LIVEKIT_DOMAIN>` with the same values.

4. Push to `main` — CI will build the agent image and deploy everything.

For the first deploy, you can also run manually on the VPS:

```bash
cd /opt/livekit
docker compose up -d
```

### What CI Does

- **deploy-agent.yml** — Builds the agent Docker image, pushes to GHCR, then does a graceful rolling deploy (scale to 2 → drain old container over 15 min → scale back to 1).
- **deploy-infra.yml** — Copies config files to the VPS and restarts infrastructure services.

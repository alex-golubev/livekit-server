# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from `agent/`:

```bash
pnpm install              # install dependencies
pnpm dev                  # run locally (requires .env with credentials)
pnpm test                 # run all tests (vitest)
pnpm typecheck            # tsc --noEmit
pnpm lint                 # biome check
pnpm lint:fix             # biome check --write
pnpm build                # compile to dist/
```

Run a single test file:
```bash
pnpm vitest run src/config.spec.ts
```

## Architecture

```
Browser ↔ LiveKit Server ↔ Agent ↔ Vertex AI Gemini (speech-to-speech)
```

Voice agent for language conversation practice. The agent connects to a LiveKit room, waits for a participant, then starts a real-time voice session via Vertex AI Gemini Live API (`gemini-live-2.5-flash-native-audio`). It adjusts complexity based on student proficiency level parsed from participant attributes.

**Vertex AI specifics:** Uses `v1beta1` API version (required for `enableAffectiveDialog` on Vertex AI — `v1alpha` only works on Gemini API). Auth via `GOOGLE_APPLICATION_CREDENTIALS` (service account JSON).

### Effect-based pipeline (`agent.ts`)

The entire agent is built on [Effect-TS](https://effect.website). The pipeline in `makeProgram`:

```
connectToRoom → [parallel] waitForParticipant + resolveModel → startSession
```

- Each step produces typed errors (`ConnectionError`, `ParticipantError`, etc.)
- Retries use `Effect.retry` with `Schedule.exponential` + `Schedule.jittered`
- Timeouts via `Effect.timeoutFail` (connect: 5s, participant: 30s, session: 20s, pipeline: 120s)
- `isRetriable` walks the error cause chain to distinguish transient vs permanent failures (e.g. 401/403 = permanent, 429 = retryable)

### Services and Layers

Dependency injection via `Context.Tag` and `Layer`:

- **ModelConfig** — env-based Gemini parameters (model, voice, temperature, project, location). Layer: `ModelConfigLive`
- **TutorConfig** — per-session config from participant attributes (language, level, prompts). Factory: `makeTutorConfigLive(attrs)`
- **GeminiModel** — wraps `RealtimeModel` constructor. Layer: `GeminiModelLive` (depends on `ModelConfig`)
- **LiveKitSession** — session lifecycle (start, monitoring, cleanup). Layer: `LiveKitSessionLive` (depends on `TutorConfig`, `GeminiModel`)

### Error types (`errors.ts`)

Six `Data.TaggedError` subclasses unified as `AgentError`. `ConfigError` is non-retryable; the rest (`TransientError`) are retryable unless caused by a permanent API error (401/403).

## Testing patterns

- **Framework:** Vitest + `@effect/vitest` (`effectIt.effect()` for Effect-based tests)
- **Config:** `requireAssertions: true` — every test must have at least one `expect()`
- **Tests are co-located** with source as `*.spec.ts`
- **Mocking:** `vi.hoisted()` + `vi.mock()` for SDK modules; `Layer.succeed()` for injecting test services
- **TestClock:** Used for timeout/retry tests — fork the effect, `TestClock.adjust()`, then `Fiber.await()`
- **Error testing:** `Effect.flip` to convert failures to values for assertion

## Code style

Enforced by Biome: 2-space indent, 120 char line width, single quotes, no semicolons, no trailing commas. No `!` non-null assertions (use `?.` optional chaining).

## Deployment

- **deploy-agent.yml:** check (typecheck + lint + test) → Docker build → GHCR push → rolling deploy to VPS
- **deploy-infra.yml:** copies config files (compose.yaml, Caddyfile, prometheus.yml, grafana/) to VPS
- Server files created manually: `/opt/livekit/.env` (secrets), `/opt/livekit/livekit.yaml` (LiveKit config with API keys), `/opt/livekit/credentials.json` (GCP service account)
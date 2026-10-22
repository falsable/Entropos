# Entropos (`@falsable/entropos`)

**Universal LLM Complexity Router, MCP Gateway & Native Anthropic/OpenAI Proxy**  
*Information-theoretic prompt complexity probing (Shannon entropy + structural branching) fused with closed-loop Beta-Bernoulli Thompson Sampling.*

[![npm version](https://img.shields.io/badge/npm-@falsable%2Fentropos%20v0.1.0-cb3837?style=flat-square&logo=npm)](https://www.npmjs.com/package/@falsable/entropos)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-3b82f6.svg?style=flat-square)](LICENSE)
[![Tests: 84 passing](https://img.shields.io/badge/tests-84%20passing-10b981.svg?style=flat-square)](#)

---

**Entropos** sits between your coding agents (Claude Code, Cursor, Gemini CLI, [A2-DLC](https://github.com/falsable/a2dlc) role containers, or any MCP / OpenAI / Anthropic client) and upstream model providers. It evaluates every incoming prompt's structural complexity in sub-millisecond time and routes it to the model with the optimal quality-to-cost posterior.

## Quick Start (`npx`)

Run the router, MCP gateway, and local telemetry console immediately without cloning:

```bash
npx @falsable/entropos --port 3000
```

Or install from source:

```bash
npm ci
cp .env.example .env     # configure your upstream provider keys
npm run build
npm start                # http://localhost:3000
```

---

## How Routing Works

1. **Shannon Entropy & Structural Probe** (`src/lib/routerEngine.ts`, `calculateShannonEntropy`): Scores each prompt across character/token Shannon entropy, lexical diversity, syntactic depth, and logical branching factor to classify task complexity (`low`, `medium`, `high`, `extreme`).
2. **Closed-Loop Bayesian Selection** (`analyzeAndPickModel`): Combines the complexity tier, routing policy (`adaptive`, `balanced`, `cost_saver`, `max_quality`), and Beta-Bernoulli posteriors (Thompson Sampling) per model.
3. **Posterior Feedback Loop** (`updatePosteriorWithFeedback`): Execution outcomes update model posteriors in SQLite (`data/entropos.db`), exposed via `/api/adaptive-telemetry`.
4. **Multi-Provider Dispatch** (`src/server/dispatcher.ts`): Dispatches to Anthropic, OpenAI, DeepSeek, and Gemini (`src/server/modelCatalog.ts`), reporting the exact model and latency that served the request, with automatic circuit-breaking and failover.

---

## Connecting Clients & Agents

### 1. Claude Code & Native Anthropic Clients (`/v1/messages`)
Entropos exposes a native **Anthropic Messages API** proxy (`POST /v1/messages` and `POST /messages`) supporting both JSON and **Server-Sent Events (SSE) streaming** (`message_start`, `content_block_delta`, `message_delta`, `message_stop`), accepting `x-api-key` or `Authorization: Bearer <workspace-key>`:

```bash
export ANTHROPIC_BASE_URL="http://localhost:3000"
export ANTHROPIC_API_KEY="<your-entropos-workspace-key>"
claude
```

### 2. OpenAI-Compatible Clients (`/v1/chat/completions`)
Point Cursor, Continue, or any OpenAI SDK client to `/v1`:
- `GET http://localhost:3000/v1/models`
- `POST http://localhost:3000/v1/chat/completions` (`Authorization: Bearer <workspace-key>`)

### 3. Model Context Protocol (`POST /mcp`, `GET /mcp/sse`)
Expose the `entropos-mcp` server to any MCP host with three built-in tools:

| Tool | Description |
|---|---|
| `smart_generate` | Routes and executes a task on the optimal model for the given routing preference |
| `get_optimal_model` | Returns the recommended model and complexity tier for a prompt without executing it |
| `check_savings` | Returns cumulative cost savings and routed request telemetry |

### 4. A2-DLC Role Container Integration (`A2DLC_LLM=entropos`)
When running [A2-DLC](https://github.com/falsable/a2dlc) (`a2dlc run`), role containers (Specifiers $\alpha/\beta$, Inquisitor, Saboteur, Builders) can route their inference and cost accounting through Entropos by setting `"A2DLC_LLM": "entropos"` in `.a2dlc/roles.json` (with `ENTROPOS_API_KEY` in `env_file` and `ENTROPOS_URL` pointing to the gateway).

---

## Persistence, Encryption & Zero Data Retention (ZDR)

`src/server/storage.ts` uses an embedded **SQLite WAL** engine (`node:sqlite` at `data/entropos.db`) for atomic $O(1)$ concurrent writes:

- **Encryption at Rest (AES-256-GCM)**: Provider API secrets (`providerSecrets`) are encrypted at rest with a 12-byte random IV and authentication tag derived from `STORAGE_ENCRYPTION_KEY` or `data/.entropos_secret` (`0600`).
- **Retention Policies (`retentionPolicy` via `GET`/`POST /api/settings`)**:

| Policy | Behavior | Target Use Case |
|---|---|---|
| `metadata_only` *(default)* | **Never stores** `fullPrompt` or `responseText`. Stores only analytical metadata (tokens, latency, chosen model, cost, savings) and a 60-char snippet. | Standard development and production |
| `zero_retention` | **Strict Zero Data Retention (ZDR)**: `fullPrompt`, `responseText`, and `promptSnippet` are empty on disk. Only anonymous quota and budget counters are kept. | Regulated / ISO 42001 enterprise environments |
| `full` | Stores full prompt and response text (requires explicit opt-in). | Local debugging and evaluation |

- **Moat Protection**: Internal routing variables (raw Shannon entropy bits, Thompson Sampling draws, posterior means) are never persisted to disk or leaked in public API responses.

---

## Endpoint Security

Two separate credential scopes protect the gateway:

1. **Admin Token (`ENTROPOS_ADMIN_TOKEN`)**: Guards console and management endpoints (`/api/settings`, `/api/diagnostics/*`, `/api/keys`, `/api/route`, `/api/chat`, `/api/probe`, `/api/feedback`, `/api/adaptive-telemetry/reset`) alongside per-IP rate limiters. In `NODE_ENV=production`, requests fail closed (`503`) if `ENTROPOS_ADMIN_TOKEN` is unset.
2. **Workspace Keys**: Used by client agents on `/v1/chat/completions`, `/v1/messages`, `/mcp`, and `/mcp/sse` via `Authorization: Bearer <key>` or `x-api-key`. Keys are generated once in the console (`GET /api/keys` exposes only the last 4 characters).

---

## Development & Verification

```bash
npm run lint     # tsc --noEmit (strict static typecheck)
npm test         # 84 automated tests (contracts, guards, ZDR, SQLite WAL, Anthropic SSE, moat security)
npm run build    # Vite SPA build + esbuild server bundle (dist/server.js)
a2dlc check      # Deterministic differential & property gate
```

## License

[Apache-2.0](LICENSE). © 2026 Aldemar Hernández · [falsable](https://github.com/falsable).

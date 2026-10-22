---
name: entropos
description: >-
  Universal LLM Complexity Router, MCP Gateway, and native Anthropic/OpenAI proxy (@falsable/entropos).
  Activate this skill when launching or configuring Entropos, wiring Claude Code (/v1/messages),
  Cursor/Codex (/v1/chat/completions), MCP tools (smart_generate, get_optimal_model, check_savings),
  or A2-DLC role inference (A2DLC_LLM=entropos).
---

# Entropos Agent Skill (`@falsable/entropos`)

**Entropos** is an information-theoretic LLM Complexity Router and MCP Gateway. It measures incoming prompt complexity via Shannon entropy and syntactic branching, routing each request to the model with the best quality-to-cost posterior via closed-loop Beta-Bernoulli Thompson Sampling.

---

## 1. Starting the Entropos Server

Run Entropos via `npx` or from a local checkout:

```bash
# Quick start via npx (default port 3000):
npx @falsable/entropos --port 3000

# Or from local source:
npm ci && npm run build && npm start
```

Verify the server is healthy:
```bash
curl -s http://localhost:3000/healthz
```

---

## 2. Creating a Workspace Key for Agent Clients

Client endpoints (`/v1/messages`, `/v1/chat/completions`, `/mcp`, `/mcp/sse`) require an Entropos Workspace Key:

```bash
# In local dev (or pass -H "X-Entropos-Admin-Token: $ENTROPOS_ADMIN_TOKEN" in production):
curl -s -X POST http://localhost:3000/api/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "agent-workspace"}'
```

Save the returned `"key"` value (e.g., `ent_...`) — it is displayed only once.

---

## 3. Connecting Coding Agents

### A. Claude Code (Native Anthropic Messages API + SSE Streaming)
Point Claude Code directly to Entropos:

```bash
export ANTHROPIC_BASE_URL="http://localhost:3000"
export ANTHROPIC_API_KEY="<your-entropos-workspace-key>"
claude
```

Entropos intercepts `POST /v1/messages` (and `POST /messages`), scores the prompt complexity, dispatches to the selected upstream model, and streams back native Anthropic SSE events (`message_start`, `content_block_delta`, `message_delta`, `message_stop`) with the `x-entropos-routed-model` header.

### B. OpenAI-Compatible Agents (Codex, Cursor, Continue)
Configure your client with:
- **Base URL:** `http://localhost:3000/v1`
- **API Key:** `<your-entropos-workspace-key>`
- **Model:** `auto` (or any model from `GET /v1/models`)

### C. MCP Client Configuration (Claude Desktop, Gemini CLI, Cursor MCP)
Register Entropos as an HTTP/SSE MCP server in your agent's `mcp_config.json`:

```json
{
  "mcpServers": {
    "entropos": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer <your-entropos-workspace-key>"
      }
    }
  }
}
```

Available MCP tools:
- `get_optimal_model`: Probe prompt complexity and get the recommended model without executing it.
- `smart_generate`: Route and execute a prompt using the selected routing mode (`adaptive`, `balanced`, `cost_saver`, `max_quality`).
- `check_savings`: Inspect cumulative cost savings and routed request counts.

### D. A2-DLC Role Containers (`A2DLC_LLM=entropos`)
In `.a2dlc/roles.json`, configure roles to route inference through Entropos:

```json
{
  "schema_version": 1,
  "roles": {
    "builder_primary": {
      "family": "claude",
      "image": "a2dlc-roles:0.7",
      "argv": ["python3", "/a2dlc/adapter.py"],
      "network": "provider",
      "env": {
        "A2DLC_LLM": "entropos",
        "ENTROPOS_URL": "http://host.docker.internal:3000/v1/chat/completions",
        "A2DLC_MODEL": "auto"
      },
      "env_file": "C:/Users/me/.config/a2dlc/entropos.env"
    }
  }
}
```
*(where `entropos.env` contains `ENTROPOS_API_KEY=<your-entropos-workspace-key>`).*

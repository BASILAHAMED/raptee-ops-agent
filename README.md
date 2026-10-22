# Raptee Ops Agent

A self-hosted MCP server + simulated Alexa+ Echo Show web app for **Raptee.HV**,
India's first high-voltage electric motorcycle company. Built for the
Amazon Developer Hackathon - Build, Ship, Shape (Alexa+ track).

One voice/chat surface, three personas, 22 real tools backed by a real
(seeded) SQLite dataset - not a demo that just answers trivia.

## The pitch

Raptee sells a genuinely different EV motorcycle - CCS2 universal charging
means every T30 owner can use India's existing EV **car** fast-charging
network, not a scarce motorcycle-specific grid. That single fact unlocks a
three-sided voice product:

- **Prospects** get real answers (specs, running-cost math, availability) and
  the conversation itself becomes a sales action: `capture_lead`,
  `book_test_ride`.
- **Owners** get real service actions: `log_service_request` (deduped),
  `get_ticket`, `book_service_slot`, `request_roadside_assistance` (always
  urgent, distinct from a routine ticket), `check_warranty_coverage` (computed
  from purchase date + odometer, not a canned answer), `file_insurance_claim`,
  `request_customization`.
- **Leadership** gets decision signals, not raw tables: `get_funnel_summary`
  (lead -> test ride -> purchase conversion), `get_maintenance_queue` (with an
  overdue/SLA flag), `get_rsa_activity` (flags unusual breakdown-call volume -
  a possible quality signal), `owner_briefing` (the rollup).

## Architecture

```
apps/mcp   Streamable HTTP MCP server (spec 2025-11-25), Express, node:sqlite
apps/sim   Simulated Alexa+ Echo Show web app, Next.js/React/TypeScript
docs/      DESIGN.md, this README, friction-log.md
```

**`apps/mcp`** is the real, spec-compliant MCP server:
- Stateless Streamable HTTP - a fresh `McpServer` + transport per POST to `/mcp`
- Bearer auth via `MCP_TOKEN`
- Native `node:sqlite` (`DatabaseSync`, WAL, foreign keys on) - no better-sqlite3
- 22 tools across the three personas, 2 resources (a markdown FAQ, a JSON
  "most recent active ticket" snapshot), 1 prompt (`owner-daily-briefing`)
- `SEED=1` seeds ~7 owners/bikes, a mix of ticket statuses (including one
  intentionally overdue past the 48h SLA), staggered test-ride/service slots,
  14 days of sales, 3 unconverted leads, showroom inventory, and 2 RSA calls

**`apps/sim`** is the only consumer of that data, and it is *only* allowed to
reach it through a real `@modelcontextprotocol/sdk` client over Streamable
HTTP with the bearer token - see the comment at the top of
`src/lib/mcpClient.ts`. The agent is a 3-tier fallback:

1. **Groq** (`GROQ_API_KEY`, `openai/gpt-oss-120b` via OpenAI-compatible chat
   completions, real function-calling) - tried first if the key is set.
2. **Gemini** (`GEMINI_API_KEY`, `gemini-3.6-flash` via `@google/genai`,
   native function declarations) - tried next.
3. **Scripted keyword fallback** - zero external API keys required. This is
   what the hackathon verification below exercises end-to-end.

All three tiers call the exact same MCP tools through the exact same client
wrapper - there is no "shortcut" path that bypasses MCP.

The UI is an Echo-Show-style ambient device: pick a persona at the top,
get persona-specific example prompts, type or tap, get a spoken (Web Speech
API) and written reply, and open the **traceability drawer** to see which
tier answered and, for every MCP tool call that turn, the full arguments
*and* the full response (not just one half).

## Running it

### 1. MCP server

```bash
cd apps/mcp
pnpm install   # (or from repo root: pnpm install)
pnpm build
SEED=1 PORT=3301 DB_PATH=./raptee-ops.db MCP_TOKEN=change-me node dist/server.js
# or for live dev: pnpm dev
```
Listens on `http://127.0.0.1:3301/mcp` (health check at `/health`).

### 2. Simulated Alexa+ web app

```bash
cd apps/sim
cp .env.example .env.local   # fill in MCP_TOKEN to match the server above
pnpm build && pnpm start     # or pnpm dev for live reload
```
Listens on `http://127.0.0.1:3401`. With no `GROQ_API_KEY`/`GEMINI_API_KEY`
set, it runs the scripted fallback automatically (or force it with
`AGENT=scripted`).

### 3. From the repo root

```bash
pnpm install
pnpm -r test     # real tests for both apps
pnpm build       # builds both apps
```

## Testing philosophy

`apps/mcp`'s vitest suite spins up a **real** HTTP server and drives it with
the **real** `@modelcontextprotocol/sdk` `Client` + `StreamableHTTPClientTransport`
- no mocked transport. `apps/sim`'s vitest suite exercises the scripted
agent's keyword routing against multiple natural phrasings per scenario (not
one canned sentence each) with the MCP client mocked, since its job is to
prove routing, not re-prove the MCP server's own data correctness.

See the delivery report / commit history for the live `curl`/Node script
verification against a running server, which is the authoritative proof this
actually works end-to-end.

## Known limitations

- Groq/Gemini tiers are implemented against their real SDKs/APIs but were not
  exercised live in this build (no API keys available at build time) - only
  the scripted fallback was verified end-to-end, per the task's priority.
- `leadToPurchasePct` in the funnel can exceed 100% in the seed data because
  `sales` and `leads` are independent seed tables (a sale isn't tied back to
  the specific lead that generated it) - acceptable for a demo funnel, but a
  real implementation would link sales to the lead/test-ride that produced them.
- Free-text extraction (name/phone/city/VIN) in the scripted agent is
  regex-based and intentionally conservative: it asks a clarifying question
  rather than guessing when required fields aren't present in the message.

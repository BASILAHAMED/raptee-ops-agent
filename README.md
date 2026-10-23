# Raptee Ops Agent

**The voice ops layer EV two-wheeler brands are missing.** A self-hosted MCP
server + simulated Alexa+ Echo Show app that replaces three broken phone
conversations - sales, service, leadership reporting - with one agentic
surface, built against real Raptee.HV data for the Amazon Developer
Hackathon (Build, Ship, Shape - Alexa+ track).

One voice/chat surface, three personas, 22 real tools backed by a real
(seeded) SQLite dataset - not a demo that just answers trivia.

## Live Demo

Both apps are deployed to Vercel production — judges can try the full chain
with zero local setup:

- **Simulated Alexa+ Echo Show app:** https://raptee-ops-sim.vercel.app
- **MCP server (Streamable HTTP, bearer-token protected):** https://raptee-ops-mcp.vercel.app
  - Health check: https://raptee-ops-mcp.vercel.app/health
  - MCP endpoint: `POST https://raptee-ops-mcp.vercel.app/mcp`

Try it end-to-end:

```bash
curl -s https://raptee-ops-sim.vercel.app/api/context   # live seeded owner/lead ids
curl -s -X POST https://raptee-ops-sim.vercel.app/api/agent \
  -H 'content-type: application/json' \
  -d '{"message":"Why should I buy an EV instead of a petrol bike?","persona":"prospect"}'
```

Note: the MCP server runs as a stateless Vercel serverless function with its
SQLite DB written to `/tmp` and re-seeded (`SEED=1`) on every cold start, so
demo data does **not** persist permanently across cold starts — this is an
expected serverless tradeoff for this hackathon deployment, not a bug.

## The pitch

**India sells over 1 million electric two-wheelers a year, and every one of
those OEMs runs the same three broken conversations by phone and email:** a
prospect who wants a straight answer on range/cost before they'll visit a
showroom, an owner with a battery problem who can't get a human on the line
fast enough, and a GM who finds out the workshop queue is backed up by
reading a spreadsheet a week late. Raptee.HV is the forcing example here -
CCS2 universal charging means a T30 owner can use India's existing EV **car**
charging network, not a scarce motorcycle-specific grid, which is exactly the
kind of fact a prospect needs explained clearly and immediately, not buried
in a brochure.

**Who actually buys this:** the direct customer is any EV two-wheeler OEM or
multi-brand dealership group (Raptee, Ather, Ola Electric, TVS iQube, Bajaj
Chetak, Revolt and the dozen smaller brands behind them) - not the end rider.
It replaces or augments a call center/showroom-floor headcount that today
handles exactly these three jobs by phone, WhatsApp, and walk-in, at a
fraction of the fully-loaded cost of even one shift of human agents, and it
never puts a caller on hold. The natural pricing shape is the same SaaS model
any dealership-management or CRM add-on uses: a flat platform fee plus a
per-location or per-conversation charge, sold into an OEM's existing service
network rather than to individual riders.

**The business case, in numbers a judge can check against the code, not
marketing copy:**
- Every prospect conversation that reaches `capture_lead` or `book_test_ride`
  is a sales-funnel action that happened without a human ever picking up the
  phone - at scale, that's the difference between leads that evaporate
  waiting for a callback and leads captured at 2am.
- `log_service_request` deduplicates by phone+category+2-hour window, so a
  worried owner calling three times about the same fault doesn't create three
  tickets a technician has to untangle later.
- `check_warranty_coverage` computes the answer live from purchase date and
  odometer reading - no owner is told "let me check and call you back,"
  which is the #1 driver of bad CSAT in vehicle service calls.
- `request_roadside_assistance` is deliberately a separate, always-urgent
  tool from a routine ticket - a stranded rider is a safety issue, not a
  queue item, and the leadership `get_rsa_activity` tool flags unusual
  breakdown-call volume as a possible quality signal before it becomes a
  recall-sized problem.
- `owner_briefing` turns four separate systems (bookings, workshop queue,
  sales, RSA) into one daily rollup a GM can act on same-day instead of
  finding out from a weekly report.

## Why this should win (mapped to the stated judging criteria)

- **Tech Implementation** - this is not a thin MCP wrapper around one API.
  `apps/mcp` is a real, spec-compliant (2025-11-25), stateless Streamable
  HTTP server with 22 tools, 2 resources, and a prompt, backed by genuine
  relational logic (dedup windows, computed warranty eligibility, SLA-aware
  queries) over `node:sqlite` - and it's independently verified end-to-end,
  not just unit-tested in isolation (see `docs/testing/test_results.json`:
  22/22 real tool calls against the live server, real Groq function-calling
  choosing tools autonomously, not scripted keyword matching pretending to
  be an agent).
- **Design** - the UI is a deliberate Echo Show simulation (charcoal bezel,
  Alexa-cyan light bar that reacts to listening/thinking state, light
  response cards over a dark ambient screen, mic input via the Web Speech
  API), not a generic chat widget with an Alexa logo pasted on it, and every
  response is tuned for voice: one or two short sentences, no markdown
  tables, no raw JSON, ends in one concrete next step instead of an open
  "anything else?"
- **Potential Impact** - a credible buyer (any 2W EV OEM), a quantified
  problem (missed leads, slow service response, delayed leadership
  visibility), and a product shape (SaaS, sold into an existing dealership
  network) that scales past this one hackathon demo without a pivot.
- **Quality of the Idea** - this is the "creative" example in Amazon's own
  judging rubric, not the "obvious" one: an agentic workflow that
  autonomously chains multiple tools per turn (e.g. `log_service_request` ->
  `book_service_slot` without being told the second step), a context-aware
  surface that keeps owner/lead identity across turns, and three genuinely
  different personas sharing one MCP server rather than three copies of a
  single-turn Q&A bot.

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

- Free-text extraction (name/phone/city/VIN) in the scripted agent is
  regex-based and intentionally conservative: it asks a clarifying question
  rather than guessing when required fields aren't present in the message.
- The scripted fallback is the final-resort tier only; Groq (tier 1) is the
  enforced default and was extensively verified live end-to-end against the
  real MCP server across all 22 tools and all 3 personas (see
  `docs/testing/test_results.json` - 22/22 real tool calls, `tier: "groq"`
  on nearly every response). Gemini (tier 2) is implemented against the real
  SDK but was not separately load-tested since Groq never falls through to it
  in normal operation.

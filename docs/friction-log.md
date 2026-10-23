# Friction Log

Real friction encountered while building the Raptee Ops Agent for the Build,
Ship, Shape hackathon (Alexa+ track). Entries below are genuine incidents
hit during this build, not invented for the bonus.

---

### [2026-10-23] Next.js silently cached MCP client fetch() responses across different requests

- **Persona / flow:** all three (surfaced first via leadership's `/api/context`, then confirmed for owner-persona tool calls too)
- **Task attempted:** run the full 22-tool use-case test suite against the live deployed sim app
- **Steps taken:** called `/api/context` multiple times across a test run expecting live, current seeded owner/lead IDs each time; separately verified the actual SQLite file on disk via a direct `node:sqlite` read
- **Expected:** each HTTP call to the MCP server (a different JSON-RPC body each time) returns a fresh response
- **Actual:** `/api/context` returned the *exact same* owner IDs on every call, even after the underlying MCP server had restarted and reseeded with new random IDs - the sim's `callMcpTool()` helper used the MCP SDK's `StreamableHTTPClientTransport`, whose internal `fetch()` calls were being cached by Next.js's extended fetch semantics, keyed in a way that didn't vary by request body
- **Severity:** High - this would have silently served stale/wrong tool results to real users in production, not just broken a test
- **Workaround used:** passed `cache: "no-store"` explicitly in the transport's `requestInit` for every MCP tool call
- **Actionable suggestion:** Next.js (and framework docs generally) should call out more prominently that *any* library making its own internal `fetch()` calls inside a route handler is subject to the framework's fetch-caching behavior unless explicitly opted out - this is easy to miss when the caching library (an MCP SDK transport) has no knowledge of or control over the host framework's fetch patching
- **Fix status:** fixed, see `apps/sim/src/lib/mcpClient.ts`

---

### [2026-10-23] No public Alexa+ Preview access to validate real NLG rendering

- **Persona / flow:** all three - affects every tool response
- **Task attempted:** confirm that our MCP tool `structuredContent` shapes would render the way we intended once spoken by real Alexa+, per Amazon's own design guide ("you influence Alexa's response through the data you return, not by scripting it directly")
- **Steps taken:** read the Alexa+ Add-on Design Guide and Tools/Schema/Data Design doc; searched for a sandbox or preview tool to test against
- **Expected:** some way to see how a given tool response actually gets spoken by Alexa+ before investing further in data-shape decisions
- **Actual:** no such tool exists publicly yet (Preview is invite-only); had to build and fully own a custom Echo Show simulation instead, which is explicitly allowed by the hackathon rules but means our confidence in "how this will actually sound on a real device" is necessarily lower than our confidence in the MCP server's correctness
- **Severity:** Medium - doesn't block a working submission (the simulated-experience path is explicitly sanctioned), but is a real gap in developer confidence
- **Workaround used:** built our own simulation with careful attention to the design guide's stated principles (brevity, one specific closing question, no raw-data dumps)
- **Actionable suggestion:** a lightweight hosted sandbox - paste a tool response, see Alexa+'s actual rendering - would materially shorten this feedback loop for every Add-on developer in Preview-less regions/timing
- **Fix status:** open (external dependency, not fixable from our side)

---

### [2026-10-23] Vercel serverless deployment required moving SQLite off the repo filesystem

- **Persona / flow:** infra, affects all personas once deployed
- **Task attempted:** deploy the MCP server (already stateless-by-design - a fresh `McpServer` + transport per request) to Vercel as a serverless function
- **Steps taken:** wrapped the Express app as a Vercel Node function; ran a live `initialize` + `tools/list` round trip against the deployed URL
- **Expected:** the existing local `DB_PATH` default (a file next to the server) would work unchanged
- **Actual:** Vercel's deployment filesystem is read-only at runtime except `/tmp`, so the original `DB_PATH` default failed on first write; had to branch the path based on `process.env.VERCEL`
- **Severity:** Low - caught before judging, one-line fix, but worth documenting since it's an easy first-deploy trap
- **Workaround used:** `DB_PATH` resolves to `/tmp/raptee-ops.sqlite` when `VERCEL=1`, unchanged default otherwise; `SEED=1` reseeds each cold start, which is an accepted tradeoff for a hackathon demo (documented in the README rather than hidden)
- **Actionable suggestion:** Vercel's own Node runtime docs could more prominently flag "any server with local file writes needs this branch" for MCP server authors specifically, since MCP servers commonly ship with a default local DB file for easy local dev
- **Fix status:** fixed, see `apps/mcp/src/app.ts` and `apps/mcp/vercel.json`

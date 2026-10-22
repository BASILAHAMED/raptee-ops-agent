# DESIGN.md - Raptee Ops Agent

Honest self-assessment against the four stated judging criteria for the
Amazon Developer Hackathon (Build, Ship, Shape - Alexa+ track).

## 1. Tech Implementation

**Strong.**
- Real, spec-compliant self-hosted MCP server: stateless Streamable HTTP
  (fresh server+transport per request), protocol version 2025-11-25, bearer
  auth, 22 tools, 2 resources, 1 prompt - verified with the real
  `@modelcontextprotocol/sdk` client (not a hand-rolled fetch client) in both
  the automated test suite and a standalone live verification script.
- Native `node:sqlite` with WAL mode and foreign keys on, as required - no
  dependency on a native-binding package that could fail to build on a judge's
  machine.
- The sim app's 3-tier agent (Groq -> Gemini -> scripted) genuinely shares one
  MCP client code path across all three tiers; there's no "fake" shortcut that
  only the scripted tier uses.
- Weak spot, honestly: the Groq and Gemini tiers are implemented against real
  SDKs with real function-calling/function-declaration wiring, but were not
  live-tested in this build window (no API keys supplied yet). Only the
  scripted fallback is proven end-to-end with real HTTP traffic. That's a real
  implementation gap, not a design gap - the code path exists and type-checks,
  it just hasn't been run against a live Groq/Gemini endpoint yet.

## 2. Design

**Solid for a hackathon timeline, not polished.**
- The core design decision - give each of the three personas distinct
  high-value *actions*, not just Q&A - is the strongest design choice here.
  `capture_lead`, `request_roadside_assistance`, `check_warranty_coverage`,
  and `get_funnel_summary` are the kind of tools that make this feel like an
  operational product rather than a chatbot demo.
- The traceability drawer (tier + full args + full response per tool call) is
  a judge-facing design choice specifically aimed at proving "this isn't
  hardcoded" without needing to read source code.
- Visual design is intentionally minimal (a dark Echo-Show-style shell,
  persona tabs, example-prompt chips) - enough to read as a device simulation,
  not a competition-grade UI. Given the time budget, correctness and real
  verification were prioritized over visual polish, per the brief.

## 3. Potential Impact

**Real and specific, not generic "AI assistant" hand-waving.**
- Raptee is an early-stage EV motorcycle company; every one of these personas
  maps to a real operational cost center they already have: a sales team
  manually logging interested walk-ins, a service desk fielding phone calls,
  and a leadership team without a single rolled-up daily view.
- The RSA-volume-anomaly flag (`get_rsa_activity`) and the overdue-SLA flag
  (`get_maintenance_queue`) are specifically designed to turn operational data
  into a decision a CEO would actually act on that day - not just a bigger
  dashboard.
- The CCS2-charging-as-differentiator framing is the one argument that
  actually changes a prospective buyer's mental model (motorcycle EV charging
  infra anxiety is real in India); building `why_raptee` and
  `estimate_running_cost` around that is a considered choice, not filler.

## 4. Quality of Idea

**Clear and defensible, if not maximally novel.**
- "Voice assistant for a business's three stakeholder types through one MCP
  server" isn't a brand-new category, but applying it specifically to an
  EV-motorcycle company's actual friction points (charging anxiety, warranty
  ambiguity between battery/vehicle terms, RSA urgency triage) is specific
  enough to be more than a generic CRM-bot pitch.
- The honest risk: a judge could reasonably ask "why does this need to be
  voice/Alexa+ specifically, versus any chat UI?" The answer the product
  leans on is hands-free urgency scenarios (an owner stranded roadside, a
  CEO wanting a spoken daily briefing while driving) - that's argued in the
  product, not just asserted here.

## What would most improve this with more time

1. Live-verify the Groq and Gemini tiers once API keys are available.
2. Link `sales` records to the `lead`/`test_ride_booking` that produced them,
   so funnel conversion percentages can't exceed 100%.
3. A real voice-latency pass (today's example prompts are text-typed in the
   sim; real Alexa+ would need a speech-to-text leg this demo doesn't include).
4. More showroom cities/inventory depth for a richer `check_availability` demo.

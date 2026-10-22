import { callMcpTool } from "../mcpClient";
import type { AgentContext, AgentResponse } from "./types";
import type { Persona } from "../personas";
import type { McpToolCallTrace } from "../mcpClient";

const KNOWN_CITIES = ["Chennai", "Bengaluru", "Bangalore", "Coimbatore", "Hyderabad", "Kochi"];
const KNOWN_COLORS = ["Arctic White", "Eclipse Black", "Mercury Grey", "White", "Black", "Grey", "Gray"];

function norm(color: string): string {
  const map: Record<string, string> = {
    white: "Arctic White",
    black: "Eclipse Black",
    grey: "Mercury Grey",
    gray: "Mercury Grey"
  };
  return map[color.toLowerCase()] ?? color;
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function extractCity(text: string): string | undefined {
  const found = KNOWN_CITIES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(text));
  if (!found) return undefined;
  return found === "Bangalore" ? "Bengaluru" : found;
}

function extractColor(text: string): string | undefined {
  const found = KNOWN_COLORS.find((c) => new RegExp(`\\b${c}\\b`, "i").test(text));
  return found ? norm(found) : undefined;
}

function extractVariant(text: string): "T30" | "T30 Sport" | undefined {
  if (/t30\s*sport/i.test(text)) return "T30 Sport";
  if (/\bt30\b/i.test(text)) return "T30";
  return undefined;
}

function extractDistanceKm(text: string): number {
  const m = text.match(/(\d+(?:\.\d+)?)\s*km/i);
  return m ? parseFloat(m[1]) : 100; // sensible default so the tool always has a number to compute with
}

function extractTicketId(text: string): string | undefined {
  const m = text.match(/TKT-[a-z0-9]{6,10}/i);
  return m ? m[0] : undefined;
}

function extractPhone(text: string): string | undefined {
  const m = text.match(/(\+?\d[\d\s-]{7,14}\d)/);
  return m ? m[1].trim() : undefined;
}

function extractName(text: string): string | undefined {
  const m = text.match(/my name is ([a-z][a-z\s.'-]{1,40})/i) ?? text.match(/i'?m\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
  return m ? m[1].trim() : undefined;
}

async function run(tool: string, args: Record<string, unknown>): Promise<{ trace: McpToolCallTrace; data: unknown }> {
  const trace = await callMcpTool(tool, args);
  return { trace, data: trace.response };
}

// ---------------------------------------------------------------------------
// PROSPECTIVE CLIENT INTENTS
// ---------------------------------------------------------------------------

async function handleProspect(message: string, ctx: AgentContext | undefined): Promise<AgentResponse> {
  const text = message.toLowerCase();
  const toolCalls: McpToolCallTrace[] = [];

  if (
    matchesAny(text, [
      /\bwhy (should i |would i )?(choose|buy|go|switch to)?\s*(an? )?(ev|electric)/i,
      /\bpetrol vs electric\b/i,
      /\bbenefits? of (an? )?(ev|electric)/i,
      /\bswitching to (an? )?(ev|electric)/i,
      /\bworth (it )?switching\b/i
    ])
  ) {
    const { trace, data } = await run("why_choose_ev", {});
    toolCalls.push(trace);
    return {
      reply: `Here's why riders choose the T30 over petrol: ${JSON.stringify(data)}`,
      tier: "scripted",
      toolCalls
    };
  }

  if (
    matchesAny(text, [
      /\bdifference between (the )?t30\b/i,
      /\bcompar(e|ison)\b.*\bt30\b/i,
      /\bt30 (vs\.?|versus) t30 sport\b/i,
      /\bwhich (variant|one) should i (buy|pick|choose)\b/i
    ])
  ) {
    const { trace, data } = await run("compare_variants", {});
    toolCalls.push(trace);
    return { reply: `Comparison: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  if (
    matchesAny(text, [
      /\bspecs?\b/i,
      /\bspecifications?\b/i,
      /\brange\b/i,
      /\btop speed\b/i,
      /\bhow much (does|will) (it|the t30|a t30) cost\b/i,
      /\bprice\b/i,
      /\bwarranty\b.*\bbike\b/i,
      /\btell me about (the )?t30\b/i
    ])
  ) {
    const variant = extractVariant(text);
    const { trace, data } = await run("get_product_specs", variant ? { variant } : {});
    toolCalls.push(trace);
    return { reply: `T30 specs: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  if (
    matchesAny(text, [
      /\bwhy raptee\b/i,
      /\bdifferent(iators?)? from other\b/i,
      /\bccs2\b/i,
      /\bcharging network\b/i,
      /\bwhat makes raptee\b/i
    ])
  ) {
    const { trace, data } = await run("why_raptee", {});
    toolCalls.push(trace);
    return { reply: `Why Raptee: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  if (
    matchesAny(text, [
      /\binsurance\b/i,
      /\bmaintenance plan\b/i,
      /\bdoorstep service\b/i,
      /\broadside assistance\b.*\boffer\b/i,
      /\bsupport (hours|info|contact)\b/i,
      /\bhow do i (reach|contact) raptee\b/i
    ])
  ) {
    const { trace, data } = await run("get_support_info", {});
    toolCalls.push(trace);
    return { reply: `Support info: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  if (
    matchesAny(text, [
      /\brunning cost\b/i,
      /\bhow much (will|would|do) i save\b/i,
      /\bcost per km\b/i,
      /\bfuel (cost|savings?)\b/i,
      /\belectricity (cost|vs petrol)\b/i
    ])
  ) {
    const distance_km = extractDistanceKm(text);
    const { trace, data } = await run("estimate_running_cost", { distance_km });
    toolCalls.push(trace);
    return { reply: `Running cost estimate for ${distance_km} km: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  if (
    matchesAny(text, [
      /\bavailab(le|ility)\b/i,
      /\bin stock\b/i,
      /\bshowroom\b/i,
      /\bdo you have\b.*\bin\b/i
    ])
  ) {
    const city = extractCity(text);
    const variant = extractVariant(text);
    const color = extractColor(text);
    const { trace, data } = await run("check_availability", { city, variant, color });
    toolCalls.push(trace);
    return { reply: `Availability: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  if (
    matchesAny(text, [
      /\btest ride\b/i,
      /\bbook a ride\b/i,
      /\bschedule a ride\b/i
    ])
  ) {
    const leadId = ctx?.leadId;
    if (!leadId) {
      return {
        reply:
          "I'd love to book you a test ride - first I need your name, phone and city to register you as a lead. " +
          "Could you share those?",
        tier: "scripted",
        toolCalls
      };
    }
    const city = extractCity(text) ?? "Chennai";
    const { trace, data } = await run("book_test_ride", {
      lead_id: leadId,
      date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      location: `${city} Showroom`
    });
    toolCalls.push(trace);
    return { reply: `Test ride booked: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  if (
    matchesAny(text, [
      /\bi'?m interested\b/i,
      /\bi want to buy\b/i,
      /\bsign me up\b/i,
      /\btake my details\b/i,
      /\bcontact me\b/i,
      /my name is/i
    ])
  ) {
    const name = extractName(text);
    const phone = extractPhone(text);
    const city = extractCity(text);
    if (!name || !phone || !city) {
      return {
        reply:
          "Happy to pass your details to our sales team - could you share your name, phone number, and city?",
        tier: "scripted",
        toolCalls
      };
    }
    const variant = extractVariant(text);
    const color = extractColor(text);
    const { trace, data } = await run("capture_lead", {
      name,
      phone,
      city,
      interested_variant: variant,
      interested_color: color
    });
    toolCalls.push(trace);
    return { reply: `Thanks ${name}, you're on our list: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  return {
    reply:
      "I can help with why choose EV, T30/T30 Sport specs, comparisons, running-cost savings, showroom availability, " +
      "capturing your details, or booking a test ride. What would you like to know?",
    tier: "scripted",
    toolCalls
  };
}

// ---------------------------------------------------------------------------
// EXISTING OWNER INTENTS
// ---------------------------------------------------------------------------

const CATEGORY_PATTERNS: Array<{ category: string; patterns: RegExp[] }> = [
  {
    category: "battery",
    patterns: [
      /\bbattery\b.*\b(died|dead|not charging|won'?t charge|drain(ing|s)? fast|losing charge)\b/i,
      /\bwon'?t charge\b/i,
      /\bbattery\b/i
    ]
  },
  {
    category: "electrical",
    patterns: [/\bheadlight\b/i, /\bindicator\b/i, /\bflicker(ing|s)?\b/i, /\bhorn\b/i, /\belectrical\b/i]
  },
  {
    category: "mechanical",
    patterns: [/\bbrake\b/i, /\bnoise\b/i, /\bloose\b/i, /\bsuspension\b/i, /\bmechanical\b/i, /\btyre|tire\b/i]
  },
  {
    category: "software",
    patterns: [/\bscreen\b.*\b(froze|frozen|freezing|glitch)\b/i, /\bapp\b.*\bsync\b/i, /\bota\b/i, /\bsoftware\b/i, /\bdashboard\b/i]
  },
  {
    category: "customization",
    patterns: [/\bcustom(i[sz]ation)?\b/i, /\baftermarket\b/i, /\bseat cover\b/i, /\bwrap\b/i, /\bpaint job\b/i]
  }
];

function detectCategory(text: string): string | undefined {
  for (const c of CATEGORY_PATTERNS) {
    if (matchesAny(text, c.patterns)) return c.category;
  }
  return undefined;
}

async function handleOwner(message: string, ctx: AgentContext | undefined): Promise<AgentResponse> {
  const text = message.toLowerCase();
  const toolCalls: McpToolCallTrace[] = [];

  // RSA is distinct and higher-urgency: breakdown/stranded language takes priority over a generic category match.
  if (
    matchesAny(text, [
      /\bstranded\b/i,
      /\bbroke(n)? down\b/i,
      /\bstuck on the road\b/i,
      /\bneed (roadside|emergency) (help|assistance)\b/i,
      /\broadside assistance\b/i,
      /\brsa\b/i
    ])
  ) {
    if (!ctx?.ownerId || !ctx?.bikeVin) {
      return { reply: "To dispatch roadside assistance I need your owner profile selected first.", tier: "scripted", toolCalls };
    }
    const locationMatch = message.match(/(?:near|at|on)\s+([a-z0-9 ,.'-]{3,60})/i);
    const location = locationMatch ? locationMatch[1].trim() : "Location not specified";
    const { trace, data } = await run("request_roadside_assistance", {
      owner_id: ctx.ownerId,
      bike_vin: ctx.bikeVin,
      location
    });
    toolCalls.push(trace);
    return { reply: `Roadside assistance dispatched: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  if (matchesAny(text, [/\bstatus of (ticket|my ticket)\b/i, /\bTKT-/i, /\blook ?up ticket\b/i, /\bcheck my ticket\b/i])) {
    const ticketId = extractTicketId(message);
    if (!ticketId) {
      return { reply: "What's the ticket ID (e.g. TKT-xxxxxxxx) you'd like me to look up?", tier: "scripted", toolCalls };
    }
    const { trace, data } = await run("get_ticket", { ticket_id: ticketId });
    toolCalls.push(trace);
    return { reply: `Ticket ${ticketId}: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  if (matchesAny(text, [/\bbook\b.*\b(service|workshop|slot|ticket)\b/i, /\bschedule\b.*\bservice\b/i])) {
    const ticketId = extractTicketId(message);
    if (!ticketId) {
      return { reply: "Which ticket ID should I schedule into the workshop?", tier: "scripted", toolCalls };
    }
    const { trace, data } = await run("book_service_slot", { ticket_id: ticketId });
    toolCalls.push(trace);
    return { reply: `Service slot booked: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  if (matchesAny(text, [/\bwarranty\b/i, /\bcovered\b/i, /\bchargeable\b/i])) {
    if (!ctx?.bikeVin) {
      return { reply: "Which bike (VIN) and what kind of issue should I check warranty coverage for?", tier: "scripted", toolCalls };
    }
    const category = detectCategory(text) ?? "mechanical";
    const { trace, data } = await run("check_warranty_coverage", { bike_vin: ctx.bikeVin, category });
    toolCalls.push(trace);
    return { reply: `Warranty check: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  if (matchesAny(text, [/\binsurance claim\b/i, /\bfile a claim\b/i, /\bclaim for\b/i])) {
    if (!ctx?.ownerId) {
      return { reply: "I need your owner profile selected to file an insurance claim.", tier: "scripted", toolCalls };
    }
    const { trace, data } = await run("file_insurance_claim", {
      owner_id: ctx.ownerId,
      incident_desc: message
    });
    toolCalls.push(trace);
    return { reply: `Insurance claim filed: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  const category = detectCategory(text);
  if (category) {
    if (!ctx?.ownerId || !ctx?.bikeVin) {
      return { reply: "I need your owner profile and bike selected before logging a service request.", tier: "scripted", toolCalls };
    }
    if (category === "customization") {
      const { trace, data } = await run("request_customization", {
        owner_id: ctx.ownerId,
        bike_vin: ctx.bikeVin,
        description: message
      });
      toolCalls.push(trace);
      return { reply: `Customization request logged: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
    }
    const urgency = /\burgent\b|\bemergency\b|\basap\b/i.test(text) ? "urgent" : "normal";
    const { trace, data } = await run("log_service_request", {
      owner_id: ctx.ownerId,
      bike_vin: ctx.bikeVin,
      category,
      description: message,
      urgency
    });
    toolCalls.push(trace);
    return { reply: `Service request logged: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  return {
    reply:
      "I can log a service request (battery, electrical, mechanical, software, customization), look up a ticket by ID, " +
      "book a workshop slot, dispatch roadside assistance, check warranty coverage, or file an insurance claim. " +
      "What's going on with your bike?",
    tier: "scripted",
    toolCalls
  };
}

// ---------------------------------------------------------------------------
// LEADERSHIP INTENTS
// ---------------------------------------------------------------------------

async function handleLeadership(message: string): Promise<AgentResponse> {
  const text = message.toLowerCase();
  const toolCalls: McpToolCallTrace[] = [];

  if (
    matchesAny(text, [
      /\bbriefing\b/i,
      /\bwhat'?s going on\b/i,
      /\bhow'?s the business\b/i,
      /\bdaily summary\b/i,
      /\bgive me the rundown\b/i
    ])
  ) {
    const { trace, data } = await run("owner_briefing", {});
    toolCalls.push(trace);
    return { reply: `Daily briefing: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  if (matchesAny(text, [/\bbooking(s)?\b/i, /\bbooked\b/i, /\btest rides? today\b/i])) {
    const { trace, data } = await run("get_booking_status", {});
    toolCalls.push(trace);
    return { reply: `Booking status: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  if (matchesAny(text, [/\bfunnel\b/i, /\bconversion\b/i, /\bleads? (captured|to purchase)\b/i, /\bhow many leads\b/i])) {
    const { trace, data } = await run("get_funnel_summary", {});
    toolCalls.push(trace);
    return { reply: `Funnel summary: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  if (matchesAny(text, [/\bmaintenance queue\b/i, /\bworkshop\b/i, /\boverdue\b/i, /\bin for service\b/i])) {
    const { trace, data } = await run("get_maintenance_queue", {});
    toolCalls.push(trace);
    return { reply: `Maintenance queue: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  if (matchesAny(text, [/\bsales\b/i, /\brevenue\b/i, /\bunits sold\b/i, /\btop[- ]selling\b/i])) {
    const { trace, data } = await run("get_sales_insights", {});
    toolCalls.push(trace);
    return { reply: `Sales insights: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  if (matchesAny(text, [/\brsa\b/i, /\broadside\b/i, /\bbreakdown calls?\b/i])) {
    const { trace, data } = await run("get_rsa_activity", {});
    toolCalls.push(trace);
    return { reply: `RSA activity: ${JSON.stringify(data)}`, tier: "scripted", toolCalls };
  }

  return {
    reply:
      "I can show today's booking status, the sales funnel, the maintenance queue (with overdue flags), sales insights, " +
      "RSA activity, or a full daily owner briefing. What would you like to see?",
    tier: "scripted",
    toolCalls
  };
}

export async function runScriptedAgent(
  message: string,
  persona: Persona,
  context?: AgentContext
): Promise<AgentResponse> {
  if (persona === "prospect") return handleProspect(message, context);
  if (persona === "owner") return handleOwner(message, context);
  return handleLeadership(message);
}

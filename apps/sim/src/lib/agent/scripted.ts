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

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

async function run(tool: string, args: Record<string, unknown>): Promise<{ trace: McpToolCallTrace; data: any }> {
  const trace = await callMcpTool(tool, args);
  return { trace, data: trace.response };
}

function reply(text: string, tier: AgentResponse["tier"], toolCalls: McpToolCallTrace[]): AgentResponse {
  return { reply: text, tier, toolCalls };
}

// ---------------------------------------------------------------------------
// HUMANIZED RESPONSE RENDERERS
// These turn raw tool JSON into plain spoken sentences a real agent would
// say out loud - no tables, no raw field names, no JSON. The scripted tier
// has no LLM to do this on the fly, so each tool gets a hand-written
// template that reads the data and narrates the part that matters.
// ---------------------------------------------------------------------------

function sayWhyChooseEv(d: any): string {
  return (
    `Honestly, the biggest reason people switch is cost - you're looking at about ${inr(d.runningCostPer100Km.petrolInr)} ` +
    `per 100km on petrol versus roughly ${inr(d.runningCostPer100Km.evInr)} on the T30, so it pays for itself fast. ` +
    `You also get real performance - ${d.performance} - with instant torque off the line, and zero tailpipe emissions. ` +
    `And charging's genuinely simple: the T30 uses the same CCS2 plug as electric cars, so you're not waiting on some ` +
    `brand-new motorcycle charging network to get built - any existing fast charger works, and you'll go from 20 to 80% in about 36 minutes.`
  );
}

function sayCompareVariants(): string {
  return (
    "Good question - honestly, the T30 and T30 Sport are mechanically identical. Same 0-to-60 in 3.5 seconds, same 135 km/h top speed, " +
    "same 200km range, same price. It really comes down to which trim you like the look of, since there's no performance trade-off either way."
  );
}

function sayProductSpecs(d: any, variant?: string): string {
  const v = variant ? d : d.T30;
  const name = variant ?? "T30";
  return (
    `The ${name} is priced at ${inr(v.priceInr)} all-inclusive, ex-showroom. It does 0 to 60 in ${v.zeroToSixtyKmhSec} seconds, ` +
    `tops out at ${v.topSpeedKmh} km/h, and gets you about ${v.idcRangeKm}km on a charge. Public fast charging takes it from ` +
    `20 to 80% in around ${v.publicFastCharge20to80Min} minutes - at home it's closer to an hour. It comes in ${v.colors.join(", ")}, ` +
    `and has a ${v.dashboard}.`
  );
}

function sayWhyRaptee(): string {
  return (
    "What really sets Raptee apart is the charging - the T30 uses CCS2, the same standard as electric cars in India, so it plugs " +
    "straight into the fast-growing car charging network instead of waiting on motorcycle-specific infrastructure. On top of that " +
    "you get a proper companion app - real-time battery and ride telematics, charge tracking, geofencing, over-the-air updates, and " +
    "a Find My Raptee feature if you ever lose track of where you parked."
  );
}

function sayGetSupportInfo(d: any): string {
  return (
    `You're covered well here - the battery carries an ${d.warranty.batteryYears}-year or ${d.warranty.batteryKm.toLocaleString()}km warranty, ` +
    `and the vehicle itself is covered for ${d.warranty.vehicleYears} years or ${d.warranty.vehicleKm.toLocaleString()}km. On top of that you get ` +
    `${d.doorstepService} doorstep service and ${d.roadsideAssistance.split(" - ")[0]} roadside assistance included. For anything else, ` +
    `you can reach the team directly at ${d.contact}.`
  );
}

function sayRunningCost(d: any): string {
  return (
    `Over ${d.distanceKm}km, a typical petrol bike would cost you about ${inr(d.petrol.costInr)} in fuel, while the T30 ` +
    `would cost roughly ${inr(d.raptee.costInr)} in electricity - that's about ${inr(d.savingsInr)} back in your pocket, ` +
    `around a ${Math.round(d.savingsPercent)}% saving. (Just a heads up - the petrol-side numbers are typical Indian averages for comparison, not a specific bike's exact mileage.)`
  );
}

function sayAvailability(rows: any[]): string {
  if (!rows.length) {
    return "I'm not seeing stock matching that right now in what I can check - want me to look at a nearby city or a different colour instead?";
  }
  const lines = rows.map((r) => `${r.qty_in_stock} of the ${r.color} ${r.variant} in ${r.city}`);
  return `Here's what's available: ${lines.join(", ")}.`;
}

function sayTestRideBooked(d: any): string {
  return `You're all set - I've booked your test ride for ${d.ride_date} at ${d.time_slot}, at ${d.location}. Looking forward to seeing you there!`;
}

function sayLeadCaptured(d: any, name: string): string {
  if (d.duplicate) {
    return `Thanks ${name} - looks like we already have your details on file, so I've just updated them. Our sales team will be in touch.`;
  }
  return `Thanks so much, ${name} - I've got your details and passed them straight to our sales team. They'll reach out to you shortly.`;
}

function sayTicketLogged(d: any): string {
  if (d.duplicate) {
    return `Looks like you already reported this recently - I've got it open as ticket ${d.ticket.id}, status ${d.ticket.status}. No need to log it twice, want me to get it scheduled?`;
  }
  const urgencyNote = d.ticket.urgency === "urgent" ? " I've flagged it as urgent." : "";
  return `Got it, I'm sorry you're dealing with that. I've logged it as ticket ${d.ticket.id}.${urgencyNote} Want me to get it scheduled into the workshop?`;
}

function sayTicket(d: any): string {
  const t = d.ticket;
  const bookingNote = d.booking ? ` It's booked in for ${d.booking.slot_date} at ${d.booking.slot_time}.` : " It hasn't been scheduled yet.";
  return `That one's a ${t.category} issue, currently ${t.status}.${bookingNote}`;
}

function sayServiceBooked(d: any): string {
  return `Done - you're booked into the workshop for ${d.slot_date} at ${d.slot_time}.`;
}

function sayWarranty(d: any): string {
  if (d.covered) {
    return `Good news - that's covered under your ${d.warrantyType.split(" (")[0]} warranty, so there's no charge for this one.`;
  }
  return `I checked, and unfortunately that one falls outside warranty - ${d.reason.toLowerCase()} I can still get it booked in, it'll just be a chargeable service.`;
}

function sayRsaDispatched(d: any): string {
  return `I've dispatched roadside assistance to you right away at ${d.request.location} - someone will be on the way shortly. ${d.warrantyNote}`;
}

function sayClaimFiled(d: any): string {
  return `I've filed your insurance claim - reference ${d.id}, currently marked as filed. Our insurance partner will follow up with next steps.`;
}

function sayCustomizationLogged(): string {
  return `I've logged your customization request - we'll get back to you on timing and cost once the workshop team takes a look.`;
}

function sayBookingStatus(d: any): string {
  if (d.testRideCount === 0 && d.purchaseCount === 0) {
    return "Quiet one today - nothing booked in yet, no test rides or purchases.";
  }
  const parts: string[] = [];
  if (d.testRideCount) parts.push(`${d.testRideCount} test ride${d.testRideCount === 1 ? "" : "s"} booked`);
  if (d.purchaseCount) parts.push(`${d.purchaseCount} purchase${d.purchaseCount === 1 ? "" : "s"} today`);
  return `Today you've got ${parts.join(" and ")}.`;
}

function sayFunnel(d: any): string {
  return (
    `Over the last ${d.periodDays} days, ${d.leadsCaptured} new leads came in, ${d.testRidesBooked} of them booked a test ride ` +
    `- about ${Math.round(d.conversion.leadToTestRidePct)}% - and we closed ${d.totalPurchases} sales in total across the showroom.`
  );
}

function sayMaintenanceQueue(d: any): string {
  if (d.totalOpen === 0) return "Workshop's clear right now - nothing open.";
  const overdueNote = d.overdueCount > 0 ? `, and ${d.overdueCount} of those have been sitting past the 48-hour mark and could use a push` : "";
  return `You've got ${d.totalOpen} job${d.totalOpen === 1 ? "" : "s"} open in the workshop right now${overdueNote}.`;
}

function saySalesInsights(d: any): string {
  return (
    `Over the last ${d.periodDays} days we've moved ${d.totalUnits} unit${d.totalUnits === 1 ? "" : "s"}, bringing in ${inr(d.totalRevenueInr)}. ` +
    `${d.topVariant ?? "Nothing"} has been the strongest seller${d.topColor ? `, mostly in ${d.topColor}` : ""}.`
  );
}

function sayRsaActivity(d: any): string {
  const flag = d.unusualActivityFlag ? " That's higher than usual today, might be worth a look as a possible quality signal." : "";
  return `We've had ${d.today} roadside assistance call${d.today === 1 ? "" : "s"} today, ${d.periodTotal} over the past ${d.periodDays} days.${flag}`;
}

function sayOwnerBriefing(d: any): string {
  const sentences: string[] = [];
  sentences.push(
    `Here's where things stand: ${d.bookings.testRidesToday} test ride${d.bookings.testRidesToday === 1 ? "" : "s"} and ${d.bookings.purchasesToday} purchase${d.bookings.purchasesToday === 1 ? "" : "s"} today.`
  );
  sentences.push(
    `${d.maintenance.totalOpen} job${d.maintenance.totalOpen === 1 ? "" : "s"} are open in the workshop${d.maintenance.overdueCount ? `, ${d.maintenance.overdueCount} overdue` : ""}.`
  );
  sentences.push(`Sales-wise, ${d.sales7d.totalUnits} unit${d.sales7d.totalUnits === 1 ? "" : "s"} sold this week for ${inr(d.sales7d.totalRevenueInr)}.`);
  if (d.rsa7d.todayCount > 0) sentences.push(`We had ${d.rsa7d.todayCount} roadside call${d.rsa7d.todayCount === 1 ? "" : "s"} today.`);
  if (d.flaggedItems.length) sentences.push(`Worth flagging: ${d.flaggedItems.join("; ").toLowerCase()}.`);
  return sentences.join(" ");
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
    return reply(sayWhyChooseEv(data), "scripted", toolCalls);
  }

  if (
    matchesAny(text, [
      /\bdifference between (the )?t30\b/i,
      /\bcompar(e|ison)\b.*\bt30\b/i,
      /\bt30 (vs\.?|versus) t30 sport\b/i,
      /\bwhich (variant|one) should i (buy|pick|choose)\b/i
    ])
  ) {
    const { trace } = await run("compare_variants", {});
    toolCalls.push(trace);
    return reply(sayCompareVariants(), "scripted", toolCalls);
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
    return reply(sayProductSpecs(data, variant), "scripted", toolCalls);
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
    const { trace } = await run("why_raptee", {});
    toolCalls.push(trace);
    return reply(sayWhyRaptee(), "scripted", toolCalls);
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
    return reply(sayGetSupportInfo(data), "scripted", toolCalls);
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
    return reply(sayRunningCost(data), "scripted", toolCalls);
  }

  if (matchesAny(text, [/\bavailab(le|ility)\b/i, /\bin stock\b/i, /\bshowroom\b/i, /\bdo you have\b.*\bin\b/i])) {
    const city = extractCity(text);
    const variant = extractVariant(text);
    const color = extractColor(text);
    const { trace, data } = await run("check_availability", { city, variant, color });
    toolCalls.push(trace);
    return reply(sayAvailability(data), "scripted", toolCalls);
  }

  if (matchesAny(text, [/\btest ride\b/i, /\bbook a ride\b/i, /\bschedule a ride\b/i])) {
    const leadId = ctx?.leadId;
    if (!leadId) {
      return reply(
        "I'd love to get you a test ride booked - first I just need your name, phone and city to register you. Could you share those?",
        "scripted",
        toolCalls
      );
    }
    const city = extractCity(text) ?? "Chennai";
    const { trace, data } = await run("book_test_ride", {
      lead_id: leadId,
      date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      location: `${city} Showroom`
    });
    toolCalls.push(trace);
    return reply(sayTestRideBooked(data), "scripted", toolCalls);
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
      return reply("Happy to pass your details to our sales team - could you share your name, phone number, and city?", "scripted", toolCalls);
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
    return reply(sayLeadCaptured(data, name), "scripted", toolCalls);
  }

  return reply(
    "I can help with why choose EV, T30/T30 Sport specs, comparisons, running-cost savings, showroom availability, " +
      "taking your details, or booking a test ride. What would you like to know?",
    "scripted",
    toolCalls
  );
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
      return reply("To get roadside assistance out to you I need your owner profile selected first.", "scripted", toolCalls);
    }
    const locationMatch = message.match(/(?:near|at|on)\s+([a-z0-9 ,.'-]{3,60})/i);
    const location = locationMatch ? locationMatch[1].trim() : "Location not specified";
    const { trace, data } = await run("request_roadside_assistance", {
      owner_id: ctx.ownerId,
      bike_vin: ctx.bikeVin,
      location
    });
    toolCalls.push(trace);
    return reply(sayRsaDispatched(data), "scripted", toolCalls);
  }

  if (matchesAny(text, [/\bstatus of (ticket|my ticket)\b/i, /\bTKT-/i, /\blook ?up ticket\b/i, /\bcheck my ticket\b/i])) {
    const ticketId = extractTicketId(message);
    if (!ticketId) {
      return reply("What's the ticket ID (e.g. TKT-xxxxxxxx) you'd like me to look up?", "scripted", toolCalls);
    }
    const { trace, data } = await run("get_ticket", { ticket_id: ticketId });
    toolCalls.push(trace);
    return reply(sayTicket(data), "scripted", toolCalls);
  }

  if (matchesAny(text, [/\bbook\b.*\b(service|workshop|slot|ticket)\b/i, /\bschedule\b.*\bservice\b/i])) {
    const ticketId = extractTicketId(message);
    if (!ticketId) {
      return reply("Which ticket ID should I schedule into the workshop?", "scripted", toolCalls);
    }
    const { trace, data } = await run("book_service_slot", { ticket_id: ticketId });
    toolCalls.push(trace);
    return reply(sayServiceBooked(data), "scripted", toolCalls);
  }

  if (matchesAny(text, [/\bwarranty\b/i, /\bcovered\b/i, /\bchargeable\b/i])) {
    if (!ctx?.bikeVin) {
      return reply("Which bike and what kind of issue should I check warranty coverage for?", "scripted", toolCalls);
    }
    const category = detectCategory(text) ?? "mechanical";
    const { trace, data } = await run("check_warranty_coverage", { bike_vin: ctx.bikeVin, category });
    toolCalls.push(trace);
    return reply(sayWarranty(data), "scripted", toolCalls);
  }

  if (matchesAny(text, [/\binsurance claim\b/i, /\bfile a claim\b/i, /\bclaim for\b/i])) {
    if (!ctx?.ownerId) {
      return reply("I need your owner profile selected to file an insurance claim.", "scripted", toolCalls);
    }
    const { trace, data } = await run("file_insurance_claim", {
      owner_id: ctx.ownerId,
      incident_desc: message
    });
    toolCalls.push(trace);
    return reply(sayClaimFiled(data), "scripted", toolCalls);
  }

  const category = detectCategory(text);
  if (category) {
    if (!ctx?.ownerId || !ctx?.bikeVin) {
      return reply("I need your owner profile and bike selected before logging a service request.", "scripted", toolCalls);
    }
    if (category === "customization") {
      const { trace } = await run("request_customization", {
        owner_id: ctx.ownerId,
        bike_vin: ctx.bikeVin,
        description: message
      });
      toolCalls.push(trace);
      return reply(sayCustomizationLogged(), "scripted", toolCalls);
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
    return reply(sayTicketLogged(data), "scripted", toolCalls);
  }

  return reply(
    "I can log a service request, look up a ticket, book you into the workshop, send roadside assistance, check your warranty, " +
      "or file an insurance claim. What's going on with your bike?",
    "scripted",
    toolCalls
  );
}

// ---------------------------------------------------------------------------
// LEADERSHIP INTENTS
// ---------------------------------------------------------------------------

async function handleLeadership(message: string): Promise<AgentResponse> {
  const text = message.toLowerCase();
  const toolCalls: McpToolCallTrace[] = [];

  if (
    matchesAny(text, [/\bbriefing\b/i, /\bwhat'?s going on\b/i, /\bwhat is going on\b/i, /\bhow'?s the business\b/i, /\bhow is the business\b/i, /\bdaily summary\b/i, /\bgive me the rundown\b/i])
  ) {
    const { trace, data } = await run("owner_briefing", {});
    toolCalls.push(trace);
    return reply(sayOwnerBriefing(data), "scripted", toolCalls);
  }

  if (matchesAny(text, [/\bbooking(s)?\b/i, /\bbooked\b/i, /\btest rides? today\b/i])) {
    const { trace, data } = await run("get_booking_status", {});
    toolCalls.push(trace);
    return reply(sayBookingStatus(data), "scripted", toolCalls);
  }

  if (matchesAny(text, [/\bfunnel\b/i, /\bconversion\b/i, /\bleads? (captured|to purchase)\b/i, /\bhow many leads\b/i])) {
    const { trace, data } = await run("get_funnel_summary", {});
    toolCalls.push(trace);
    return reply(sayFunnel(data), "scripted", toolCalls);
  }

  if (matchesAny(text, [/\bmaintenance queue\b/i, /\bworkshop\b/i, /\boverdue\b/i, /\bin for service\b/i])) {
    const { trace, data } = await run("get_maintenance_queue", {});
    toolCalls.push(trace);
    return reply(sayMaintenanceQueue(data), "scripted", toolCalls);
  }

  if (matchesAny(text, [/\bsales\b/i, /\brevenue\b/i, /\bunits sold\b/i, /\btop[- ]selling\b/i])) {
    const { trace, data } = await run("get_sales_insights", {});
    toolCalls.push(trace);
    return reply(saySalesInsights(data), "scripted", toolCalls);
  }

  if (matchesAny(text, [/\brsa\b/i, /\broadside\b/i, /\bbreakdown calls?\b/i])) {
    const { trace, data } = await run("get_rsa_activity", {});
    toolCalls.push(trace);
    return reply(sayRsaActivity(data), "scripted", toolCalls);
  }

  return reply(
    "I can show today's booking status, the sales funnel, the maintenance queue, sales insights, RSA activity, or a full daily briefing. " +
      "What would you like to see?",
    "scripted",
    toolCalls
  );
}

export async function runScriptedAgent(message: string, persona: Persona, context?: AgentContext): Promise<AgentResponse> {
  if (persona === "prospect") return handleProspect(message, context);
  if (persona === "owner") return handleOwner(message, context);
  return handleLeadership(message);
}

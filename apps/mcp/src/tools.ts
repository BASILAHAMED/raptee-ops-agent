import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db } from "./db.js";
import * as logic from "./logic.js";
import { SUPPORT_INFO, COMPANY, WARRANTY } from "./data/facts.js";

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}

function tool<T>(fn: () => T) {
  try {
    return textResult(fn());
  } catch (err) {
    return errorResult(err);
  }
}

const VARIANT_ENUM = z.enum(["T30", "T30 Sport"]);
const CATEGORY_ENUM = z.enum(["battery", "electrical", "mechanical", "software", "customization"]);
const URGENCY_ENUM = z.enum(["normal", "urgent"]);

export function buildServer(db: Db): McpServer {
  const server = new McpServer(
    { name: "raptee-ops-agent", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  // ===================== PROSPECTIVE CLIENT TOOLS =====================

  server.registerTool(
    "why_choose_ev",
    {
      title: "Why choose an EV",
      description: "Explains EV vs petrol-motorcycle benefits using real running-cost and performance data.",
      inputSchema: {}
    },
    async () => tool(() => logic.whyChooseEv())
  );

  server.registerTool(
    "get_product_specs",
    {
      title: "Get product specs",
      description: "Returns Raptee T30 / T30 Sport specs: performance, range, charging, warranty, price, colors.",
      inputSchema: { variant: VARIANT_ENUM.optional() }
    },
    async ({ variant }) => tool(() => logic.getProductSpecs(variant))
  );

  server.registerTool(
    "why_raptee",
    {
      title: "Why Raptee",
      description: "Explains Raptee's differentiators, especially CCS2 universal charging.",
      inputSchema: {}
    },
    async () => tool(() => logic.whyRaptee())
  );

  server.registerTool(
    "get_support_info",
    {
      title: "Get support info",
      description: "Warranty terms, insurance, maintenance plans, doorstep service, RSA, and contact details.",
      inputSchema: {}
    },
    async () => tool(() => logic.getSupportInfo())
  );

  server.registerTool(
    "compare_variants",
    {
      title: "Compare T30 vs T30 Sport",
      description: "Side-by-side spec comparison between the T30 and T30 Sport.",
      inputSchema: {}
    },
    async () => tool(() => logic.compareVariants())
  );

  server.registerTool(
    "estimate_running_cost",
    {
      title: "Estimate running cost",
      description: "Computes petrol vs Raptee-electricity running cost for a given distance in km.",
      inputSchema: { distance_km: z.number().positive() }
    },
    async ({ distance_km }) => tool(() => logic.estimateRunningCost(distance_km))
  );

  server.registerTool(
    "check_availability",
    {
      title: "Check showroom availability",
      description: "Checks stock/color availability at showrooms, optionally filtered by city, variant, color.",
      inputSchema: { city: z.string().optional(), variant: VARIANT_ENUM.optional(), color: z.string().optional() }
    },
    async ({ city, variant, color }) => tool(() => logic.checkAvailability(db, { city, variant, color }))
  );

  server.registerTool(
    "capture_lead",
    {
      title: "Capture a sales lead",
      description:
        "Records a prospective buyer's details when they show buying intent. Deduplicates by phone number.",
      inputSchema: {
        name: z.string().min(1),
        phone: z.string().min(5),
        city: z.string().min(1),
        interested_variant: VARIANT_ENUM.optional(),
        interested_color: z.string().optional()
      }
    },
    async (input) => tool(() => logic.captureLead(db, input))
  );

  server.registerTool(
    "book_test_ride",
    {
      title: "Book a test ride",
      description: "Schedules a test-ride slot (date/time/location) for an existing lead.",
      inputSchema: {
        lead_id: z.string().min(1),
        date: z.string().min(8),
        location: z.string().min(1),
        time_slot: z.string().optional()
      }
    },
    async (input) => tool(() => logic.bookTestRide(db, input))
  );

  // ===================== EXISTING CLIENT (OWNER) TOOLS =====================

  server.registerTool(
    "log_service_request",
    {
      title: "Log a service request",
      description:
        "Reports an owner's bike issue and creates a ticket. Detects duplicates: same owner + category within 2 hours returns the existing ticket.",
      inputSchema: {
        owner_id: z.string().min(1),
        bike_vin: z.string().min(1),
        category: CATEGORY_ENUM,
        description: z.string().min(1),
        urgency: URGENCY_ENUM.optional()
      }
    },
    async (input) => tool(() => logic.logServiceRequest(db, input))
  );

  server.registerTool(
    "get_ticket",
    {
      title: "Get ticket by ID",
      description: "Direct lookup of any service ticket by its ID, regardless of status.",
      inputSchema: { ticket_id: z.string().min(1) }
    },
    async ({ ticket_id }) => tool(() => logic.getTicket(db, ticket_id))
  );

  server.registerTool(
    "book_service_slot",
    {
      title: "Book a workshop service slot",
      description: "Schedules a ticket onto the workshop calendar, picking the first open slot. Urgent tickets get priority.",
      inputSchema: { ticket_id: z.string().min(1) }
    },
    async ({ ticket_id }) => tool(() => logic.bookServiceSlot(db, ticket_id))
  );

  server.registerTool(
    "request_roadside_assistance",
    {
      title: "Request roadside assistance (RSA)",
      description:
        "Dispatches roadside assistance immediately; always treated as urgent. Captures current location/landmark.",
      inputSchema: {
        owner_id: z.string().min(1),
        bike_vin: z.string().min(1),
        location: z.string().min(1),
        landmark: z.string().optional()
      }
    },
    async (input) => tool(() => logic.requestRoadsideAssistance(db, input))
  );

  server.registerTool(
    "check_warranty_coverage",
    {
      title: "Check warranty coverage",
      description:
        "Determines whether an issue is covered under the 8yr/80,000km battery warranty or 3yr/30,000km vehicle warranty, computed from purchase date and odometer.",
      inputSchema: { bike_vin: z.string().min(1), category: CATEGORY_ENUM }
    },
    async (input) => tool(() => logic.checkWarrantyCoverage(db, input))
  );

  server.registerTool(
    "file_insurance_claim",
    {
      title: "File an insurance claim",
      description: "Records an insurance claim against a ticket/incident.",
      inputSchema: { owner_id: z.string().min(1), ticket_id: z.string().optional(), incident_desc: z.string().min(1) }
    },
    async (input) => tool(() => logic.fileInsuranceClaim(db, input))
  );

  server.registerTool(
    "request_customization",
    {
      title: "Request a customization",
      description: "Logs a customization request for a bike (not a repair).",
      inputSchema: { owner_id: z.string().min(1), bike_vin: z.string().min(1), description: z.string().min(1) }
    },
    async (input) => tool(() => logic.requestCustomization(db, input))
  );

  // ===================== LEADERSHIP TOOLS =====================

  server.registerTool(
    "get_booking_status",
    {
      title: "Get booking status",
      description: "Today's (or a given date's) test-ride and purchase bookings.",
      inputSchema: { date: z.string().optional() }
    },
    async ({ date }) => tool(() => logic.getBookingStatus(db, date))
  );

  server.registerTool(
    "get_funnel_summary",
    {
      title: "Get sales funnel summary",
      description: "Leads captured -> test rides booked -> completed -> purchases, as a conversion funnel over a period.",
      inputSchema: { days: z.number().int().positive().optional() }
    },
    async ({ days }) => tool(() => logic.getFunnelSummary(db, days))
  );

  server.registerTool(
    "get_maintenance_queue",
    {
      title: "Get maintenance queue",
      description: "Bikes currently in the workshop pipeline, flagged overdue if open more than 48h.",
      inputSchema: {}
    },
    async () => tool(() => logic.getMaintenanceQueue(db))
  );

  server.registerTool(
    "get_sales_insights",
    {
      title: "Get sales insights",
      description: "Units sold, revenue, top-selling variant/color, over a period.",
      inputSchema: { days: z.number().int().positive().optional() }
    },
    async ({ days }) => tool(() => logic.getSalesInsights(db, days))
  );

  server.registerTool(
    "get_rsa_activity",
    {
      title: "Get RSA activity",
      description: "Roadside-assistance call volume today/this period, flagged if unusually high.",
      inputSchema: { days: z.number().int().positive().optional() }
    },
    async ({ days }) => tool(() => logic.getRsaActivity(db, days))
  );

  server.registerTool(
    "owner_briefing",
    {
      title: "Owner / CEO daily briefing",
      description: "Rolled-up daily summary across bookings, funnel, maintenance, sales and RSA activity, with flagged items.",
      inputSchema: {}
    },
    async () => tool(() => logic.ownerBriefing(db))
  );

  // ===================== RESOURCES =====================

  server.registerResource(
    "service-info-faq",
    "raptee://faq/service-info",
    {
      title: "Raptee service & support FAQ",
      description: "Markdown FAQ covering warranty, insurance, maintenance, doorstep service and RSA.",
      mimeType: "text/markdown"
    },
    async (uri) => {
      const md = `# Raptee.HV Service & Support FAQ

**Battery warranty:** ${WARRANTY.batteryYears} years / ${WARRANTY.batteryKm.toLocaleString()} km
**Vehicle warranty:** ${WARRANTY.vehicleYears} years / ${WARRANTY.vehicleKm.toLocaleString()} km
**Doorstep service:** ${WARRANTY.doorstepServiceYears} year included
**Roadside assistance (RSA):** ${WARRANTY.rsaYears} year included, always dispatched as urgent

**Insurance:** ${SUPPORT_INFO.insurance}
**Maintenance plans:** ${SUPPORT_INFO.maintenancePlans}

**Contact:** ${COMPANY.supportPhone} | ${COMPANY.supportHours} | ${COMPANY.supportEmail}
`;
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: md }] };
    }
  );

  server.registerResource(
    "active-ticket",
    "raptee://tickets/active",
    {
      title: "Most recently created active ticket",
      description: "JSON snapshot of the most recent non-done service ticket, for quick dashboard display.",
      mimeType: "application/json"
    },
    async (uri) => {
      const row = db
        .prepare("SELECT * FROM tickets WHERE status != 'done' ORDER BY created_at DESC LIMIT 1")
        .get();
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(row ?? null, null, 2) }] };
    }
  );

  // ===================== PROMPTS =====================

  server.registerPrompt(
    "owner-daily-briefing",
    {
      title: "Owner daily briefing prompt",
      description: "Generates a prompt asking for a concise, action-oriented daily business briefing for Raptee leadership."
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Using the owner_briefing, get_funnel_summary, get_maintenance_queue, get_sales_insights and " +
              "get_rsa_activity tools, produce a concise spoken-style daily briefing for a Raptee.HV leader: " +
              "today's test rides and purchases, any overdue service tickets, the 7-day sales funnel, and any " +
              "flagged items that need a decision today. Keep it under 150 words and lead with what needs attention."
          }
        }
      ]
    })
  );

  return server;
}

/**
 * Tool schemas mirrored from apps/mcp/src/tools.ts input shapes, in OpenAI
 * function-calling format (also reused to build Gemini's native function
 * declarations). Keep these in sync with the MCP server's registered tools.
 */
import type OpenAI from "openai";

function fn(name: string, description: string, parameters: Record<string, unknown>): OpenAI.Chat.ChatCompletionTool {
  return { type: "function", function: { name, description, parameters } };
}

const VARIANT_ENUM = { type: "string", enum: ["T30", "T30 Sport"] };
const CATEGORY_ENUM = { type: "string", enum: ["battery", "electrical", "mechanical", "software", "customization"] };
const URGENCY_ENUM = { type: "string", enum: ["normal", "urgent"] };

export const TOOL_SCHEMAS_OPENAI: OpenAI.Chat.ChatCompletionTool[] = [
  fn("why_choose_ev", "Explain EV vs petrol-motorcycle benefits with real data.", { type: "object", properties: {} }),
  fn("get_product_specs", "Get T30 / T30 Sport specs.", {
    type: "object",
    properties: { variant: VARIANT_ENUM }
  }),
  fn("why_raptee", "Explain Raptee's differentiators (CCS2 charging).", { type: "object", properties: {} }),
  fn("get_support_info", "Warranty, insurance, maintenance, doorstep service, RSA, contact.", {
    type: "object",
    properties: {}
  }),
  fn("compare_variants", "Side-by-side T30 vs T30 Sport comparison.", { type: "object", properties: {} }),
  fn("estimate_running_cost", "Compute petrol vs Raptee electricity running cost for a distance.", {
    type: "object",
    properties: { distance_km: { type: "number" } },
    required: ["distance_km"]
  }),
  fn("check_availability", "Check showroom stock/color availability.", {
    type: "object",
    properties: { city: { type: "string" }, variant: VARIANT_ENUM, color: { type: "string" } }
  }),
  fn("capture_lead", "Record a prospective buyer's details (dedup by phone).", {
    type: "object",
    properties: {
      name: { type: "string" },
      phone: { type: "string" },
      city: { type: "string" },
      interested_variant: VARIANT_ENUM,
      interested_color: { type: "string" }
    },
    required: ["name", "phone", "city"]
  }),
  fn("book_test_ride", "Schedule a test ride for an existing lead.", {
    type: "object",
    properties: {
      lead_id: { type: "string" },
      date: { type: "string" },
      location: { type: "string" },
      time_slot: { type: "string" }
    },
    required: ["lead_id", "date", "location"]
  }),
  fn("log_service_request", "Report an owner's bike issue (dedup within 2h per owner+category).", {
    type: "object",
    properties: {
      owner_id: { type: "string" },
      bike_vin: { type: "string" },
      category: CATEGORY_ENUM,
      description: { type: "string" },
      urgency: URGENCY_ENUM
    },
    required: ["owner_id", "bike_vin", "category", "description"]
  }),
  fn("get_ticket", "Direct lookup of a service ticket by ID, any status.", {
    type: "object",
    properties: { ticket_id: { type: "string" } },
    required: ["ticket_id"]
  }),
  fn("book_service_slot", "Schedule a ticket onto the workshop calendar.", {
    type: "object",
    properties: { ticket_id: { type: "string" } },
    required: ["ticket_id"]
  }),
  fn("request_roadside_assistance", "Dispatch roadside assistance immediately (always urgent).", {
    type: "object",
    properties: {
      owner_id: { type: "string" },
      bike_vin: { type: "string" },
      location: { type: "string" },
      landmark: { type: "string" }
    },
    required: ["owner_id", "bike_vin", "location"]
  }),
  fn("check_warranty_coverage", "Determine warranty coverage from purchase date + odometer.", {
    type: "object",
    properties: { bike_vin: { type: "string" }, category: CATEGORY_ENUM },
    required: ["bike_vin", "category"]
  }),
  fn("file_insurance_claim", "Record an insurance claim against a ticket/incident.", {
    type: "object",
    properties: { owner_id: { type: "string" }, ticket_id: { type: "string" }, incident_desc: { type: "string" } },
    required: ["owner_id", "incident_desc"]
  }),
  fn("request_customization", "Log a customization request (not a repair).", {
    type: "object",
    properties: { owner_id: { type: "string" }, bike_vin: { type: "string" }, description: { type: "string" } },
    required: ["owner_id", "bike_vin", "description"]
  }),
  fn("get_booking_status", "Today's (or given date's) test-ride and purchase bookings.", {
    type: "object",
    properties: { date: { type: "string" } }
  }),
  fn("get_funnel_summary", "Lead -> test-ride -> completed -> purchase funnel over a period.", {
    type: "object",
    properties: { days: { type: "number" } }
  }),
  fn("get_maintenance_queue", "Bikes in the workshop pipeline, flagged overdue past 48h SLA.", {
    type: "object",
    properties: {}
  }),
  fn("get_sales_insights", "Units, revenue, top variant/color over a period.", {
    type: "object",
    properties: { days: { type: "number" } }
  }),
  fn("get_rsa_activity", "Roadside-assistance call volume, flagged if unusual.", {
    type: "object",
    properties: { days: { type: "number" } }
  }),
  fn("owner_briefing", "Rolled-up daily business summary with flagged items.", { type: "object", properties: {} })
];

const BASE = "http://127.0.0.1:3401/api/agent";

const OWNER = { ownerId: "OWN-8a1e3a09", bikeVin: "RAPT30A0001IN" }; // Arjun Mehta, T30
const LEAD = { leadId: "LEAD-e5fbe7e7" }; // Anita Desai

async function ask(message, persona, context) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, persona, context })
  });
  const data = await res.json();
  return data;
}

function toolsUsed(data) {
  return (data.toolCalls ?? []).map((c) => c.tool).join(",");
}

const cases = [
  // --- prospect (9 tools) ---
  { persona: "prospect", msg: "Why should I buy an EV instead of a petrol bike?", expect: "why_choose_ev" },
  { persona: "prospect", msg: "What are the specs of the T30?", expect: "get_product_specs" },
  { persona: "prospect", msg: "What makes Raptee different from other EV bikes?", expect: "why_raptee" },
  { persona: "prospect", msg: "What warranty and support do you offer?", expect: "get_support_info" },
  { persona: "prospect", msg: "What's the difference between the T30 and T30 Sport?", expect: "compare_variants" },
  { persona: "prospect", msg: "How much would I save riding 150km a day compared to a petrol bike?", expect: "estimate_running_cost" },
  { persona: "prospect", msg: "Do you have the Arctic White T30 available in Chennai?", expect: "check_availability" },
  { persona: "prospect", msg: "I'm interested - my name is Rohan Kumar, phone 9845099988, I'm in Bengaluru.", expect: "capture_lead" },
  { persona: "prospect", msg: "Can you book me a test ride in Chennai?", expect: "book_test_ride", context: LEAD },

  // --- owner (7 tools) ---
  { persona: "owner", msg: "My battery isn't holding charge properly anymore.", expect: "log_service_request", context: OWNER },
  { persona: "owner", msg: "I'm stranded near OMR, Chennai, need roadside help right now.", expect: "request_roadside_assistance", context: OWNER },
  { persona: "owner", msg: "Is a brake issue covered under my warranty?", expect: "check_warranty_coverage", context: OWNER },
  { persona: "owner", msg: "I need to file an insurance claim, my bike got scratched in a parking accident.", expect: "file_insurance_claim", context: OWNER },
  { persona: "owner", msg: "I want to customize my bike with a new seat cover.", expect: "request_customization", context: OWNER },
  // get_ticket and book_service_slot need a real ticket id - chained below after log_service_request

  // --- leadership (6 tools) ---
  { persona: "leadership", msg: "What's booked today?", expect: "get_booking_status" },
  { persona: "leadership", msg: "How's our sales funnel looking?", expect: "get_funnel_summary" },
  { persona: "leadership", msg: "What's in the maintenance queue?", expect: "get_maintenance_queue" },
  { persona: "leadership", msg: "Give me sales insights for the week.", expect: "get_sales_insights" },
  { persona: "leadership", msg: "How many roadside assistance calls today?", expect: "get_rsa_activity" },
  { persona: "leadership", msg: "Give me the daily briefing.", expect: "owner_briefing" }
];

const results = [];

for (const c of cases) {
  try {
    const data = await ask(c.msg, c.persona, c.context);
    const used = toolsUsed(data);
    const pass = used.includes(c.expect);
    results.push({ persona: c.persona, msg: c.msg, expect: c.expect, used, tier: data.tier, pass, reply: data.reply });
  } catch (e) {
    results.push({ persona: c.persona, msg: c.msg, expect: c.expect, error: String(e), pass: false });
  }
}

// chained owner flow: log a ticket, then look it up, then book it
try {
  const logged = await ask("My headlight keeps flickering at night.", "owner", OWNER);
  const ticketMatch = JSON.stringify(logged.toolCalls).match(/TKT-[a-z0-9]{6,10}/i);
  const ticketId = ticketMatch ? ticketMatch[0] : null;
  results.push({ persona: "owner", msg: "My headlight keeps flickering at night.", expect: "log_service_request", used: toolsUsed(logged), tier: logged.tier, pass: toolsUsed(logged).includes("log_service_request"), reply: logged.reply });

  if (ticketId) {
    const looked = await ask(`What's the status of ticket ${ticketId}?`, "owner", OWNER);
    results.push({ persona: "owner", msg: `status of ${ticketId}`, expect: "get_ticket", used: toolsUsed(looked), tier: looked.tier, pass: toolsUsed(looked).includes("get_ticket"), reply: looked.reply });

    const booked = await ask(`Please book that ticket ${ticketId} into the workshop.`, "owner", OWNER);
    results.push({ persona: "owner", msg: `book ${ticketId}`, expect: "book_service_slot", used: toolsUsed(booked), tier: booked.tier, pass: toolsUsed(booked).includes("book_service_slot"), reply: booked.reply });
  } else {
    results.push({ persona: "owner", msg: "(no ticket id extracted)", expect: "get_ticket/book_service_slot", pass: false, error: "could not extract ticket id from log_service_request response" });
  }
} catch (e) {
  results.push({ persona: "owner", msg: "chained ticket flow", error: String(e), pass: false });
}

console.log(JSON.stringify(results, null, 2));
const passCount = results.filter((r) => r.pass).length;
console.error(`\n=== ${passCount}/${results.length} PASSED ===`);

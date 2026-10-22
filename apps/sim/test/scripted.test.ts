import { afterEach, describe, expect, it, vi } from "vitest";

const callMcpToolMock = vi.fn(async (tool: string, args: Record<string, unknown>) => ({
  tool,
  args,
  response: { ok: true, tool, args },
  isError: false
}));

vi.mock("../src/lib/mcpClient.js", () => ({
  callMcpTool: (...a: [string, Record<string, unknown>]) => callMcpToolMock(...a)
}));

const { runScriptedAgent } = await import("../src/lib/agent/scripted.js");

afterEach(() => {
  callMcpToolMock.mockClear();
});

describe("scripted agent - prospective client phrasings", () => {
  it.each([
    "Why should I choose an electric motorcycle?",
    "Why go electric instead of petrol?",
    "What are the benefits of switching to EV?"
  ])("routes '%s' to why_choose_ev", async (msg) => {
    await runScriptedAgent(msg, "prospect");
    expect(callMcpToolMock).toHaveBeenCalledWith("why_choose_ev", {});
  });

  it.each(["What are the T30 specs?", "Tell me about the T30", "How much does it cost?"])(
    "routes '%s' to get_product_specs",
    async (msg) => {
      await runScriptedAgent(msg, "prospect");
      expect(callMcpToolMock).toHaveBeenCalledWith("get_product_specs", expect.any(Object));
    }
  );

  it.each(["What makes Raptee different?", "Tell me about CCS2 charging", "Why Raptee over other EV bikes?"])(
    "routes '%s' to why_raptee",
    async (msg) => {
      await runScriptedAgent(msg, "prospect");
      expect(callMcpToolMock).toHaveBeenCalledWith("why_raptee", {});
    }
  );

  it.each(["How much will I save over 200 km?", "What's the running cost per km?", "Fuel cost savings vs petrol?"])(
    "routes '%s' to estimate_running_cost",
    async (msg) => {
      await runScriptedAgent(msg, "prospect");
      expect(callMcpToolMock).toHaveBeenCalledWith("estimate_running_cost", expect.any(Object));
    }
  );

  it.each([
    "Is the Arctic White T30 available in Chennai?",
    "Do you have stock in Bengaluru?",
    "Showroom availability in Coimbatore"
  ])("routes '%s' to check_availability", async (msg) => {
    await runScriptedAgent(msg, "prospect");
    expect(callMcpToolMock).toHaveBeenCalledWith("check_availability", expect.any(Object));
  });

  it("captures a lead when name/phone/city are present", async () => {
    await runScriptedAgent("I'm interested, my name is Rohan Gupta, my phone is +91 98765 43210, I'm in Chennai", "prospect");
    expect(callMcpToolMock).toHaveBeenCalledWith(
      "capture_lead",
      expect.objectContaining({ phone: expect.stringContaining("98765") })
    );
  });

  it("asks for details instead of guessing when lead info is incomplete", async () => {
    const result = await runScriptedAgent("I want to buy one", "prospect");
    expect(callMcpToolMock).not.toHaveBeenCalled();
    expect(result.reply.toLowerCase()).toContain("name");
  });
});

describe("scripted agent - existing owner phrasings (battery family)", () => {
  const ctx = { ownerId: "OWN-1", bikeVin: "VIN-1" };
  it.each(["my battery died", "battery won't charge", "battery is draining fast"])(
    "routes '%s' to log_service_request with category battery",
    async (msg) => {
      await runScriptedAgent(msg, "owner", ctx);
      expect(callMcpToolMock).toHaveBeenCalledWith(
        "log_service_request",
        expect.objectContaining({ category: "battery" })
      );
    }
  );

  it.each(["my headlight keeps flickering", "the indicator stopped working"])(
    "routes '%s' to log_service_request with category electrical",
    async (msg) => {
      await runScriptedAgent(msg, "owner", ctx);
      expect(callMcpToolMock).toHaveBeenCalledWith(
        "log_service_request",
        expect.objectContaining({ category: "electrical" })
      );
    }
  );

  it.each(["I'm stranded on the highway", "my bike broke down", "I need roadside assistance now"])(
    "routes '%s' to request_roadside_assistance, not a generic ticket",
    async (msg) => {
      await runScriptedAgent(msg, "owner", ctx);
      expect(callMcpToolMock).toHaveBeenCalledWith("request_roadside_assistance", expect.any(Object));
    }
  );

  it("looks up a ticket by extracted ID", async () => {
    await runScriptedAgent("What's the status of ticket TKT-ab12cd34?", "owner", ctx);
    expect(callMcpToolMock).toHaveBeenCalledWith("get_ticket", { ticket_id: "TKT-ab12cd34" });
  });

  it("checks warranty coverage", async () => {
    await runScriptedAgent("Is my brake issue covered under warranty?", "owner", ctx);
    expect(callMcpToolMock).toHaveBeenCalledWith(
      "check_warranty_coverage",
      expect.objectContaining({ bike_vin: "VIN-1" })
    );
  });

  it("files an insurance claim", async () => {
    await runScriptedAgent("I want to file an insurance claim for a fall", "owner", ctx);
    expect(callMcpToolMock).toHaveBeenCalledWith("file_insurance_claim", expect.any(Object));
  });

  it("logs a customization request distinct from a repair", async () => {
    await runScriptedAgent("Can I get a custom seat cover fitted?", "owner", ctx);
    expect(callMcpToolMock).toHaveBeenCalledWith("request_customization", expect.any(Object));
  });
});

describe("scripted agent - leadership phrasings", () => {
  it.each(["How are bookings today?", "What's booked?", "Show me today's bookings"])(
    "routes '%s' to get_booking_status",
    async (msg) => {
      await runScriptedAgent(msg, "leadership");
      expect(callMcpToolMock).toHaveBeenCalledWith("get_booking_status", {});
    }
  );

  it.each(["What's our conversion funnel?", "How many leads have we captured?"])(
    "routes '%s' to get_funnel_summary",
    async (msg) => {
      await runScriptedAgent(msg, "leadership");
      expect(callMcpToolMock).toHaveBeenCalledWith("get_funnel_summary", {});
    }
  );

  it.each(["What's in the maintenance queue?", "Any overdue tickets?", "What's in the workshop right now?"])(
    "routes '%s' to get_maintenance_queue",
    async (msg) => {
      await runScriptedAgent(msg, "leadership");
      expect(callMcpToolMock).toHaveBeenCalledWith("get_maintenance_queue", {});
    }
  );

  it.each(["Give me sales insights", "What's our revenue?", "Top-selling variant this month?"])(
    "routes '%s' to get_sales_insights",
    async (msg) => {
      await runScriptedAgent(msg, "leadership");
      expect(callMcpToolMock).toHaveBeenCalledWith("get_sales_insights", {});
    }
  );

  it.each(["Any unusual RSA activity?", "How many roadside calls today?"])(
    "routes '%s' to get_rsa_activity",
    async (msg) => {
      await runScriptedAgent(msg, "leadership");
      expect(callMcpToolMock).toHaveBeenCalledWith("get_rsa_activity", {});
    }
  );

  it.each(["Give me my daily briefing", "What's going on with the business?", "How's the business doing today?"])(
    "routes '%s' to owner_briefing",
    async (msg) => {
      await runScriptedAgent(msg, "leadership");
      expect(callMcpToolMock).toHaveBeenCalledWith("owner_briefing", {});
    }
  );
});

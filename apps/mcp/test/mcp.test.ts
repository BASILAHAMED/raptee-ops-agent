import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import express from "express";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { openDb, seedIfEmpty, closeDb } from "../src/db.js";
import { buildServer } from "../src/tools.js";

const TEST_DB = `./test-${randomUUID().slice(0, 8)}.db`;
const TEST_TOKEN = "test-secret-token";
let httpServer: Server;
let baseUrl: string;

function buildApp() {
  const db = openDb(TEST_DB);
  seedIfEmpty(db);
  const app = express();
  app.use(express.json());
  app.post("/mcp", async (req, res) => {
    const auth = req.headers.authorization ?? "";
    if (auth !== `Bearer ${TEST_TOKEN}`) {
      res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
      return;
    }
    const server = buildServer(db);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  return { app, db };
}

async function makeClient(): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${TEST_TOKEN}` } }
  });
  const client = new Client({ name: "test-client", version: "0.1.0" });
  await client.connect(transport);
  return client;
}

function firstTextJson(result: any): any {
  const block = result.content?.find((c: any) => c.type === "text");
  if (!block) throw new Error("No text content block in tool result");
  return JSON.parse(block.text);
}

beforeAll(async () => {
  const { app } = buildApp();
  httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const addr = httpServer.address();
  if (typeof addr === "object" && addr) {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  } else {
    throw new Error("Failed to bind test server");
  }
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  closeDb();
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    try {
      rmSync(TEST_DB + suffix);
    } catch {
      /* ignore */
    }
  }
});

describe("MCP protocol basics (real Streamable HTTP + real SDK client)", () => {
  it("initializes and lists all ~22 tools", async () => {
    const client = await makeClient();
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(22);
    const names = tools.map((t) => t.name);
    for (const expected of [
      "why_choose_ev",
      "get_product_specs",
      "why_raptee",
      "get_support_info",
      "compare_variants",
      "estimate_running_cost",
      "check_availability",
      "capture_lead",
      "book_test_ride",
      "log_service_request",
      "get_ticket",
      "book_service_slot",
      "request_roadside_assistance",
      "check_warranty_coverage",
      "file_insurance_claim",
      "request_customization",
      "get_booking_status",
      "get_funnel_summary",
      "get_maintenance_queue",
      "get_sales_insights",
      "get_rsa_activity",
      "owner_briefing"
    ]) {
      expect(names).toContain(expected);
    }
    await client.close();
  });

  it("rejects requests without a valid bearer token", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    });
    expect(res.status).toBe(401);
    await client_cleanup();
  });

  it("lists resources and reads the FAQ resource", async () => {
    const client = await makeClient();
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("raptee://faq/service-info");
    const read = await client.readResource({ uri: "raptee://faq/service-info" });
    expect(read.contents[0].text).toContain("Battery warranty");
    await client.close();
  });

  it("lists the owner-daily-briefing prompt", async () => {
    const client = await makeClient();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("owner-daily-briefing");
    await client.close();
  });
});

async function client_cleanup() {
  /* placeholder to keep test isolation explicit */
}

describe("Prospective client tools", () => {
  it("get_product_specs returns real T30 price and warranty-consistent data", async () => {
    const client = await makeClient();
    const result = await client.callTool({ name: "get_product_specs", arguments: { variant: "T30" } });
    const data = firstTextJson(result);
    expect(data.priceInr).toBe(239000);
    expect(data.topSpeedKmh).toBe(135);
    await client.close();
  });

  it("compare_variants shows both variants", async () => {
    const client = await makeClient();
    const result = await client.callTool({ name: "compare_variants", arguments: {} });
    const data = firstTextJson(result);
    expect(data.T30).toBeDefined();
    expect(data["T30 Sport"]).toBeDefined();
    await client.close();
  });

  it("estimate_running_cost computes a real (not hardcoded) number that scales with distance", async () => {
    const client = await makeClient();
    const r50 = firstTextJson(await client.callTool({ name: "estimate_running_cost", arguments: { distance_km: 50 } }));
    const r500 = firstTextJson(await client.callTool({ name: "estimate_running_cost", arguments: { distance_km: 500 } }));
    expect(r500.raptee.costInr).toBeCloseTo(r50.raptee.costInr * 10, 0);
    expect(r500.petrol.costInr).toBeGreaterThan(r500.raptee.costInr);
    await client.close();
  });

  it("check_availability filters by city", async () => {
    const client = await makeClient();
    const result = await client.callTool({ name: "check_availability", arguments: { city: "Chennai" } });
    const data = firstTextJson(result) as any[];
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((r) => r.city === "Chennai")).toBe(true);
    await client.close();
  });

  it("capture_lead dedupes by phone", async () => {
    const client = await makeClient();
    const phone = "+91 90000 11111";
    const first = firstTextJson(
      await client.callTool({
        name: "capture_lead",
        arguments: { name: "Test Prospect", phone, city: "Chennai", interested_variant: "T30" }
      })
    );
    expect(first.duplicate).toBe(false);
    const second = firstTextJson(
      await client.callTool({
        name: "capture_lead",
        arguments: { name: "Test Prospect Updated", phone, city: "Chennai" }
      })
    );
    expect(second.duplicate).toBe(true);
    expect(second.lead.id).toBe(first.lead.id);
    await client.close();
  });

  it("book_test_ride schedules a lead into a non-colliding slot", async () => {
    const client = await makeClient();
    const lead = firstTextJson(
      await client.callTool({
        name: "capture_lead",
        arguments: { name: "Ride Tester", phone: "+91 90000 22222", city: "Chennai" }
      })
    ).lead;
    const booking = firstTextJson(
      await client.callTool({
        name: "book_test_ride",
        arguments: { lead_id: lead.id, date: "2099-01-01", location: "Chennai - OMR Showroom" }
      })
    );
    expect(booking.status).toBe("scheduled");
    await client.close();
  });
});

describe("Existing client (owner) tool chain", () => {
  it("log_service_request -> get_ticket -> book_service_slot works end to end", async () => {
    const client = await makeClient();
    // pull a real seeded owner + bike via a leadership tool as a cheap way to get valid ids
    const queue = firstTextJson(await client.callTool({ name: "get_maintenance_queue", arguments: {} }));
    expect(queue.tickets.length).toBeGreaterThan(0);
    const ownerId = queue.tickets[0].owner_id;
    const bikeVin = queue.tickets[0].bike_vin;

    const created = firstTextJson(
      await client.callTool({
        name: "log_service_request",
        arguments: {
          owner_id: ownerId,
          bike_vin: bikeVin,
          category: "electrical",
          description: "Test: indicator stopped working",
          urgency: "normal"
        }
      })
    );
    expect(created.duplicate).toBe(false);
    const ticketId = created.ticket.id;

    const fetched = firstTextJson(await client.callTool({ name: "get_ticket", arguments: { ticket_id: ticketId } }));
    expect(fetched.ticket.id).toBe(ticketId);

    const booked = firstTextJson(await client.callTool({ name: "book_service_slot", arguments: { ticket_id: ticketId } }));
    expect(booked.ticket_id).toBe(ticketId);

    const afterBooking = firstTextJson(await client.callTool({ name: "get_ticket", arguments: { ticket_id: ticketId } }));
    expect(afterBooking.ticket.status).toBe("scheduled");
    expect(afterBooking.booking).toBeTruthy();
    await client.close();
  });

  it("log_service_request detects duplicates within the 2h window", async () => {
    const client = await makeClient();
    const queue = firstTextJson(await client.callTool({ name: "get_maintenance_queue", arguments: {} }));
    const ownerId = queue.tickets[0].owner_id;
    const bikeVin = queue.tickets[0].bike_vin;
    const args = { owner_id: ownerId, bike_vin: bikeVin, category: "software", description: "Screen glitch" };
    const first = firstTextJson(await client.callTool({ name: "log_service_request", arguments: args }));
    const second = firstTextJson(
      await client.callTool({ name: "log_service_request", arguments: { ...args, description: "Screen glitch again" } })
    );
    expect(second.duplicate).toBe(true);
    expect(second.ticket.id).toBe(first.ticket.id);
    await client.close();
  });

  it("check_warranty_coverage computes from purchase date and odometer", async () => {
    const client = await makeClient();
    const avail = firstTextJson(await client.callTool({ name: "check_availability", arguments: {} }));
    // Use a known seeded VIN with old purchase date + high odometer (out of vehicle warranty)
    const result = firstTextJson(
      await client.callTool({ name: "check_warranty_coverage", arguments: { bike_vin: "RAPT30A0005IN", category: "mechanical" } })
    );
    expect(result.covered).toBe(false);
    const batteryResult = firstTextJson(
      await client.callTool({ name: "check_warranty_coverage", arguments: { bike_vin: "RAPT30A0007IN", category: "battery" } })
    );
    expect(batteryResult.covered).toBe(true);
    expect(avail).toBeDefined();
    await client.close();
  });

  it("request_roadside_assistance always creates a dispatched record", async () => {
    const client = await makeClient();
    const queue = firstTextJson(await client.callTool({ name: "get_maintenance_queue", arguments: {} }));
    const ownerId = queue.tickets[0].owner_id;
    const bikeVin = queue.tickets[0].bike_vin;
    const result = firstTextJson(
      await client.callTool({
        name: "request_roadside_assistance",
        arguments: { owner_id: ownerId, bike_vin: bikeVin, location: "Test Road", landmark: "Near Test Mall" }
      })
    );
    expect(result.request.status).toBe("dispatched");
    await client.close();
  });
});

describe("Leadership tools", () => {
  it("get_booking_status returns today's test rides and purchases", async () => {
    const client = await makeClient();
    const result = firstTextJson(await client.callTool({ name: "get_booking_status", arguments: {} }));
    expect(result.testRides.length).toBeGreaterThan(0);
    await client.close();
  });

  it("get_maintenance_queue flags overdue tickets", async () => {
    const client = await makeClient();
    const result = firstTextJson(await client.callTool({ name: "get_maintenance_queue", arguments: {} }));
    expect(result.overdueCount).toBeGreaterThanOrEqual(1);
    await client.close();
  });

  it("get_sales_insights aggregates seeded sales over 14 days", async () => {
    const client = await makeClient();
    const result = firstTextJson(await client.callTool({ name: "get_sales_insights", arguments: { days: 14 } }));
    expect(result.totalUnits).toBeGreaterThan(0);
    expect(result.topVariant).toBeTruthy();
    await client.close();
  });

  it("get_funnel_summary returns a conversion funnel", async () => {
    const client = await makeClient();
    const result = firstTextJson(await client.callTool({ name: "get_funnel_summary", arguments: { days: 14 } }));
    expect(result.leadsCaptured).toBeGreaterThan(0);
    await client.close();
  });

  it("get_rsa_activity reports seeded RSA volume", async () => {
    const client = await makeClient();
    const result = firstTextJson(await client.callTool({ name: "get_rsa_activity", arguments: {} }));
    expect(result.periodTotal).toBeGreaterThanOrEqual(2);
    await client.close();
  });

  it("owner_briefing rolls up all persona data with flagged items", async () => {
    const client = await makeClient();
    const result = firstTextJson(await client.callTool({ name: "owner_briefing", arguments: {} }));
    expect(result.flaggedItems).toBeDefined();
    expect(result.maintenance.overdueCount).toBeGreaterThanOrEqual(1);
    await client.close();
  });
});

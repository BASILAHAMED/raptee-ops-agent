import { NextResponse } from "next/server";
import { callMcpTool } from "@/lib/mcpClient";

export const dynamic = "force-dynamic";

/**
 * Convenience endpoint for the UI's owner/lead picker. Pulls real seeded
 * owner+bike pairs and lead ids via the SAME MCP tool calls the agent uses
 * (get_maintenance_queue, get_booking_status) - no direct DB access here
 * either, same MCP-only constraint as the agent tiers.
 */
export async function GET() {
  const [queueTrace, bookingTrace] = await Promise.all([
    callMcpTool("get_maintenance_queue", {}),
    callMcpTool("get_booking_status", {})
  ]);

  const queue = queueTrace.response as any;
  const booking = bookingTrace.response as any;

  const owners = Array.from(
    new Map(
      (queue?.tickets ?? []).map((t: any) => [
        t.owner_id,
        { ownerId: t.owner_id, ownerName: t.owner_name, bikeVin: t.bike_vin, model: t.model, color: t.color }
      ])
    ).values()
  );

  const leads = (booking?.testRides ?? []).map((r: any) => ({ leadId: r.lead_id, leadName: r.lead_name }));

  return NextResponse.json({ owners, leads });
}

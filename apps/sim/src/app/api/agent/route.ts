import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/index";
import type { Persona } from "@/lib/personas";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { message?: string; persona?: string; context?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, persona, context } = body;
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "`message` (string) is required" }, { status: 400 });
  }
  const validPersonas: Persona[] = ["prospect", "owner", "leadership"];
  const p = (validPersonas.includes(persona as Persona) ? persona : "prospect") as Persona;

  try {
    const result = await runAgent(message, p, context as any);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

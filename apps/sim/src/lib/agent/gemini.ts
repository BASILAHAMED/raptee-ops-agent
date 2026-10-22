/**
 * Gemini tier (second fallback, when GEMINI_API_KEY set and Groq unavailable
 * or GROQ_API_KEY unset): native function declarations via @google/genai,
 * model configurable via GEMINI_MODEL (default gemini-3.6-flash). Reaches
 * Raptee data ONLY via callMcpTool() - same constraint as every other tier.
 */
import { GoogleGenAI, Type } from "@google/genai";
import { callMcpTool } from "../mcpClient";
import { TOOL_SCHEMAS_OPENAI } from "./toolSchemas";
import type { AgentContext, AgentResponse } from "./types";
import type { Persona } from "../personas";
import type { McpToolCallTrace } from "../mcpClient";

function toGeminiDeclarations() {
  return TOOL_SCHEMAS_OPENAI.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: jsonSchemaToGemini(t.function.parameters as Record<string, unknown>)
  }));
}

// Minimal JSON-Schema -> Gemini Schema translator for our flat object shapes.
function jsonSchemaToGemini(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = (schema.properties ?? {}) as Record<string, any>;
  const props: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(properties)) {
    if (val.enum) {
      props[key] = { type: Type.STRING, enum: val.enum, description: val.description };
    } else if (val.type === "number") {
      props[key] = { type: Type.NUMBER, description: val.description };
    } else {
      props[key] = { type: Type.STRING, description: val.description };
    }
  }
  return {
    type: Type.OBJECT,
    properties: props,
    required: (schema.required as string[] | undefined) ?? []
  };
}

export async function runGeminiAgent(
  message: string,
  persona: Persona,
  context: AgentContext | undefined
): Promise<AgentResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

  const ai = new GoogleGenAI({ apiKey });
  const toolCalls: McpToolCallTrace[] = [];
  const systemInstruction = buildSystemPrompt(persona, context);
  const declarations = toGeminiDeclarations();

  const history: any[] = [{ role: "user", parts: [{ text: message }] }];

  for (let turn = 0; turn < 4; turn++) {
    const response = await ai.models.generateContent({
      model,
      contents: history,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: declarations as any }]
      }
    });

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

    if (functionCalls.length === 0) {
      const text = parts.map((p: any) => p.text ?? "").join("");
      return { reply: text, tier: "gemini", toolCalls };
    }

    history.push({ role: "model", parts });
    const responseParts: any[] = [];
    for (const call of functionCalls) {
      const trace = await callMcpTool(call.name, call.args ?? {});
      toolCalls.push(trace);
      responseParts.push({ functionResponse: { name: call.name, response: { result: trace.response } } });
    }
    history.push({ role: "user", parts: responseParts });
  }

  return { reply: "I wasn't able to finish that request in time - please try rephrasing.", tier: "gemini", toolCalls };
}

function buildSystemPrompt(persona: Persona, context?: AgentContext): string {
  const personaLine =
    persona === "prospect"
      ? "You are a warm, friendly Raptee showroom sales assistant helping a prospective buyer learn about the T30 electric motorcycle."
      : persona === "owner"
      ? "You are a caring, attentive Raptee customer-care agent helping an existing owner with service, warranty, or roadside support."
      : "You are a sharp, trusted ops assistant briefing Raptee leadership on what's happening in the business right now.";
  const ctxLine = context
    ? `Known context: ${JSON.stringify(context)}. Use these IDs in tool calls when relevant.`
    : "No owner/lead context is known yet; ask for details if a tool requires them.";
  return [
    personaLine,
    ctxLine,
    "Always answer using real data retrieved via the provided tools - never invent prices, specs, or ticket data.",
    "",
    "HOW TO SPEAK: you are a real human agent talking to someone, not a report generator. After a tool returns data, read it, understand what actually matters to this person, and say it back in plain warm spoken sentences - the way a genuinely helpful person on a call would, not the way a spreadsheet would.",
    "- NEVER use markdown tables, bullet-point dumps of raw fields, or headers. No pipes, no '|', no '**bold**' labels copied straight from field names.",
    "- NEVER recite raw JSON keys or internal IDs (ticket IDs, VINs, owner IDs) unless the person specifically needs to reference that ID later (e.g. quoting a ticket number back to them once, for their records).",
    "- Lead with the one or two things the person actually cares about, then add detail only if it helps. If three tickets are open and one is overdue, say that plainly - 'you've got three jobs in right now, one of them has been sitting a bit long and could use a push' - don't list all four columns per row.",
    "- Use natural connective language ('so', 'that means', 'the good news is', 'heads up'), contractions, and a touch of warmth appropriate to the persona (reassuring for an owner with a problem, enthusiastic but honest for a prospect, direct and efficient for leadership).",
    "- Keep it to a few sentences unless the person is asking for a genuine rundown (like a full daily briefing) - even then, narrate it like a person talking, not a report."
  ].join("\n");
}

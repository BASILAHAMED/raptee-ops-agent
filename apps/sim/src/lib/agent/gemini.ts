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
      ? "You are helping a PROSPECTIVE buyer evaluate the Raptee.HV T30 electric motorcycle."
      : persona === "owner"
      ? "You are helping an EXISTING Raptee owner with service, warranty, or roadside support."
      : "You are briefing RAPTEE LEADERSHIP on operational metrics.";
  const ctxLine = context
    ? `Known context: ${JSON.stringify(context)}. Use these IDs in tool calls when relevant.`
    : "No owner/lead context is known yet; ask for details if a tool requires them.";
  return `${personaLine}\n${ctxLine}\nAlways answer using real data retrieved via the provided tools - never invent prices, specs, or ticket data. Keep answers concise and voice-friendly.`;
}

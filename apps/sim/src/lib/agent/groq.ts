/**
 * Groq tier (tried first when GROQ_API_KEY is set): OpenAI-compatible chat
 * completions with real function-calling, model configurable via GROQ_MODEL
 * (default openai/gpt-oss-120b). Reaches Raptee data ONLY by calling MCP
 * tools through callMcpTool() - never a shortcut to the DB.
 */
import OpenAI from "openai";
import { callMcpTool } from "../mcpClient";
import { TOOL_SCHEMAS_OPENAI } from "./toolSchemas";
import type { AgentContext, AgentResponse } from "./types";
import type { Persona } from "../personas";
import type { McpToolCallTrace } from "../mcpClient";

export async function runGroqAgent(
  message: string,
  persona: Persona,
  context: AgentContext | undefined
): Promise<AgentResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  const model = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

  const client = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });
  const toolCalls: McpToolCallTrace[] = [];

  const systemPrompt = buildSystemPrompt(persona, context);
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: message }
  ];

  for (let turn = 0; turn < 4; turn++) {
    const completion = await client.chat.completions.create({
      model,
      messages,
      tools: TOOL_SCHEMAS_OPENAI,
      tool_choice: "auto"
    });
    const choice = completion.choices[0];
    const msg = choice.message;
    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { reply: msg.content ?? "", tier: "groq", toolCalls };
    }

    for (const call of msg.tool_calls) {
      const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      const trace = await callMcpTool(call.function.name, args);
      toolCalls.push(trace);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(trace.response)
      });
    }
  }

  return { reply: "I wasn't able to finish that request in time - please try rephrasing.", tier: "groq", toolCalls };
}

function buildSystemPrompt(persona: Persona, context?: AgentContext): string {
  const personaLine =
    persona === "prospect"
      ? "You are a warm, friendly Raptee showroom sales assistant helping a prospective buyer learn about the T30 electric motorcycle."
      : persona === "owner"
      ? "You are a caring, attentive Raptee customer-care agent helping an existing owner with service, warranty, or roadside support."
      : "You are a sharp, trusted ops assistant briefing Raptee leadership on what's happening in the business right now.";
  const ctxLine = context
    ? `Known context: ${JSON.stringify(context)}. Use these IDs in tool calls when relevant instead of asking the user to repeat them.`
    : "No owner/lead context is known yet; ask for details (name/phone/city, or owner id) if a tool requires them.";
  return [
    personaLine,
    ctxLine,
    "Always answer using real data retrieved via the provided MCP tools - never invent prices, specs, or ticket data.",
    "",
    "HOW TO SPEAK: you are a real human agent on a voice call, not a report generator. Keep it SHORT - one or two short sentences per turn, like a real phone call, not a paragraph. Read it aloud in your head: if you'd need to take a breath partway through, cut it.",
    "- NEVER use markdown tables, bullet-point dumps of raw fields, or headers. No pipes, no '|', no '**bold**' labels copied straight from field names.",
    "- NEVER recite raw JSON keys or internal IDs (ticket IDs, VINs, owner IDs) unless the person specifically needs to reference that ID later (e.g. quoting a ticket number back to them once, for their records).",
    "- Say the ONE thing that matters most, then stop. Don't list every field a tool returned - pick what this person actually needs right now. If there's a natural next step, end with ONE specific question (e.g. 'Want me to book that in?'), never an open 'anything else?'.",
    "- Use natural contractions and warmth appropriate to the persona, but brevity beats completeness. A daily briefing can run a few short sentences since it's a real rundown - everything else should be one or two."
  ].join("\n");
}

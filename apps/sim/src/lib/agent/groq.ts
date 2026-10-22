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
    "HOW TO SPEAK: you are a real human agent talking to someone, not a report generator. After a tool returns data, read it, understand what actually matters to this person, and say it back in plain warm spoken sentences - the way a genuinely helpful person on a call would, not the way a spreadsheet would.",
    "- NEVER use markdown tables, bullet-point dumps of raw fields, or headers. No pipes, no '|', no '**bold**' labels copied straight from field names.",
    "- NEVER recite raw JSON keys or internal IDs (ticket IDs, VINs, owner IDs) unless the person specifically needs to reference that ID later (e.g. quoting a ticket number back to them once, for their records).",
    "- Lead with the one or two things the person actually cares about, then add detail only if it helps. If three tickets are open and one is overdue, say that plainly - 'you've got three jobs in right now, one of them has been sitting a bit long and could use a push' - don't list all four columns per row.",
    "- Use natural connective language ('so', 'that means', 'the good news is', 'heads up'), contractions, and a touch of warmth appropriate to the persona (reassuring for an owner with a problem, enthusiastic but honest for a prospect, direct and efficient for leadership).",
    "- Keep it to a few sentences unless the person is asking for a genuine rundown (like a full daily briefing) - even then, narrate it like a person talking, not a report."
  ].join("\n");
}

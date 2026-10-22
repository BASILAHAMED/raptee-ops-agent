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
      ? "You are helping a PROSPECTIVE buyer evaluate the Raptee.HV T30 electric motorcycle."
      : persona === "owner"
      ? "You are helping an EXISTING Raptee owner with service, warranty, or roadside support."
      : "You are briefing RAPTEE LEADERSHIP on operational metrics.";
  const ctxLine = context
    ? `Known context: ${JSON.stringify(context)}. Use these IDs in tool calls when relevant instead of asking the user to repeat them.`
    : "No owner/lead context is known yet; ask for details (name/phone/city, or owner id) if a tool requires them.";
  return `${personaLine}\n${ctxLine}\nAlways answer using real data retrieved via the provided MCP tools - never invent prices, specs, or ticket data. Keep answers concise and voice-friendly.`;
}

import type { Persona } from "../personas";
import type { McpToolCallTrace } from "../mcpClient";

export interface AgentContext {
  ownerId?: string;
  bikeVin?: string;
  leadId?: string;
}

export interface AgentRequest {
  message: string;
  persona: Persona;
  context?: AgentContext;
}

export interface AgentResponse {
  reply: string;
  tier: "groq" | "gemini" | "scripted";
  toolCalls: McpToolCallTrace[];
}

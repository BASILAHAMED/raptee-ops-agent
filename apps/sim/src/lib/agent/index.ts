import { runScriptedAgent } from "./scripted";
import { runGroqAgent } from "./groq";
import { runGeminiAgent } from "./gemini";
import type { AgentContext, AgentResponse } from "./types";
import type { Persona } from "../personas";

/**
 * 3-tier fallback, exactly as specified: Groq first (if GROQ_API_KEY set),
 * then Gemini (if GEMINI_API_KEY set), then the scripted keyword fallback
 * which requires zero external API keys and is what this hackathon build
 * verifies end-to-end. AGENT env var can force a specific tier for testing
 * (AGENT=scripted|groq|gemini).
 */
export async function runAgent(message: string, persona: Persona, context?: AgentContext): Promise<AgentResponse> {
  const forced = process.env.AGENT;

  if (forced === "scripted") return runScriptedAgent(message, persona, context);
  if (forced === "groq") return runGroqAgent(message, persona, context);
  if (forced === "gemini") return runGeminiAgent(message, persona, context);

  if (process.env.GROQ_API_KEY) {
    try {
      return await runGroqAgent(message, persona, context);
    } catch (err) {
      console.error("Groq tier failed, falling back to Gemini/scripted:", err);
    }
  }
  if (process.env.GEMINI_API_KEY) {
    try {
      return await runGeminiAgent(message, persona, context);
    } catch (err) {
      console.error("Gemini tier failed, falling back to scripted:", err);
    }
  }
  return runScriptedAgent(message, persona, context);
}

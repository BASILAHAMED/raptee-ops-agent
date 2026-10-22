/**
 * The ONLY way this sim app reaches Raptee business data is through a real
 * MCP client talking Streamable HTTP to the self-hosted MCP server
 * (apps/mcp). No direct DB access, no shortcuts — every persona action in
 * this app must go through callMcpTool() below, which opens a real MCP
 * session against MCP_URL with a bearer token, exactly as any other MCP
 * client (including a real Alexa+ skill) would.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";

export interface McpToolCallTrace {
  tool: string;
  args: Record<string, unknown>;
  response: unknown;
  isError: boolean;
}

function getMcpConfig() {
  const url = process.env.MCP_URL ?? "http://127.0.0.1:3301/mcp";
  const token = process.env.MCP_TOKEN ?? "";
  return { url, token };
}

export async function callMcpTool(toolName: string, args: Record<string, unknown>): Promise<McpToolCallTrace> {
  const { url, token } = getMcpConfig();
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
  });
  const client = new Client({ name: "raptee-ops-sim", version: "0.1.0" });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: toolName, arguments: args });
    const textBlock = (result.content as Array<{ type: string; text?: string }> | undefined)?.find(
      (c) => c.type === "text"
    );
    let parsed: unknown = textBlock?.text ?? result;
    if (textBlock?.text) {
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        parsed = textBlock.text;
      }
    }
    return { tool: toolName, args, response: parsed, isError: Boolean((result as any).isError) };
  } catch (err) {
    return {
      tool: toolName,
      args,
      response: { error: err instanceof Error ? err.message : String(err) },
      isError: true
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function listMcpTools(): Promise<string[]> {
  const { url, token } = getMcpConfig();
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
  });
  const client = new Client({ name: "raptee-ops-sim", version: "0.1.0" });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => t.name);
  } finally {
    await client.close().catch(() => undefined);
  }
}

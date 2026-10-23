import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { openDb, seedIfEmpty } from "./db.js";
import { buildServer } from "./tools.js";

// On Vercel the repo filesystem is read-only at runtime; /tmp is the only
// writable path for a serverless function. Keep the local-dev default
// (./raptee-ops.db) unchanged for non-Vercel runs.
const DB_PATH =
  process.env.DB_PATH ?? (process.env.VERCEL === "1" ? "/tmp/raptee-ops.sqlite" : "./raptee-ops.db");
const MCP_TOKEN = process.env.MCP_TOKEN ?? "";

const db = openDb(DB_PATH);
if (process.env.SEED === "1") {
  seedIfEmpty(db);
}

export const app = express();
app.use(express.json({ limit: "2mb" }));

function checkAuth(req: express.Request, res: express.Response): boolean {
  if (!MCP_TOKEN) return true; // no token configured -> open (dev convenience)
  const header = req.headers.authorization ?? "";
  const expected = `Bearer ${MCP_TOKEN}`;
  if (header !== expected) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized: missing or invalid bearer token" },
      id: randomUUID()
    });
    return false;
  }
  return true;
}

// Stateless Streamable HTTP: a fresh McpServer + transport per request.
app.post("/mcp", async (req, res) => {
  if (!checkAuth(req, res)) return;
  try {
    const server = buildServer(db);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null
      });
    }
  }
});

// Stateless server: GET/DELETE (session management) are not supported.
app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed: this server is stateless (no SSE streams / sessions)." },
    id: null
  });
});
app.delete("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed: this server is stateless (no sessions to delete)." },
    id: null
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "raptee-ops-agent-mcp", protocolVersion: "2025-11-25" });
});

export { DB_PATH, MCP_TOKEN };

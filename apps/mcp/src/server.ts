import { app, DB_PATH, MCP_TOKEN } from "./app.js";

const PORT = Number(process.env.PORT ?? 3301);

// Only start a listening HTTP server for local/dev execution. On Vercel the
// `app` export is used directly as a serverless request handler (see
// apps/mcp/api/index.ts) and must never call .listen() itself.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Raptee Ops Agent MCP server listening on http://127.0.0.1:${PORT}/mcp`);
    console.log(
      `DB: ${DB_PATH} | Seeded: ${process.env.SEED === "1"} | Auth: ${MCP_TOKEN ? "bearer token required" : "open (no MCP_TOKEN set)"}`
    );
  });
}

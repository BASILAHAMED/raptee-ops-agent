import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: []
  },
  ssr: {
    external: ["node:sqlite"]
  },
  test: {
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 20000,
    globals: false,
    server: {
      deps: {
        external: [/node:sqlite/]
      }
    }
  }
});

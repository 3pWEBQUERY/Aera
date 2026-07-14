import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      // Server-only guard is meaningless in tests — replace with an empty stub.
      { find: "server-only", replacement: path.resolve(__dirname, "tests/stubs/server-only.ts") },
      { find: /^@\//, replacement: `${path.resolve(__dirname)}/` },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      AUTH_SECRET: "vitest-secret-0123456789-0123456789-0123456789",
      APP_URL: "http://localhost:3000",
    },
  },
});

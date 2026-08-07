import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      // `server-only` ist im Test bedeutungslos — der Import wird auf einen
      // leeren Stub gelenkt, damit reine Logik-Module testbar bleiben.
      { find: "server-only", replacement: path.resolve(import.meta.dirname, "tests/stubs/server-only.ts") },
      { find: /^@\//, replacement: `${path.resolve(import.meta.dirname)}/` },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});

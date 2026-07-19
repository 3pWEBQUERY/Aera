import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    ".next-qa/**",
    "private/tmp/**",
    "app/generated/**",
    "public/**",
    "Aera-visitor-member-iOS-App/**",
  ]),
  {
    // These React Compiler diagnostics were introduced after the existing UI
    // was built. Keep the established Hooks correctness rules enabled and
    // migrate these stricter patterns incrementally instead of making the
    // production pipeline unusable for unrelated changes.
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
    },
  },
]);

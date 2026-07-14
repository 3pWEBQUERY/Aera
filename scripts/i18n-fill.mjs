// Ensure every full locale catalog contains all keys present in en.json.
// Missing keys are filled with the English value as a placeholder so the
// i18n parity test (tests/i18n.test.ts) stays green. Existing translations
// are never overwritten. Regional override-only catalogs are left partial.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");
const OVERRIDE_ONLY = new Set(["en-GB.json", "es-419.json"]);

const en = JSON.parse(readFileSync(join(dir, "en.json"), "utf8"));

/** Recursively add keys from `src` that are missing in `dst`. Returns count. */
function fill(src, dst) {
  let added = 0;
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (!dst[k] || typeof dst[k] !== "object") dst[k] = {};
      added += fill(v, dst[k]);
    } else if (!(k in dst)) {
      dst[k] = v;
      added++;
    }
  }
  return added;
}

const files = readdirSync(dir).filter(
  (f) => f.endsWith(".json") && f !== "en.json" && !OVERRIDE_ONLY.has(f),
);

let total = 0;
for (const file of files) {
  const path = join(dir, file);
  const cat = JSON.parse(readFileSync(path, "utf8"));
  const added = fill(en, cat);
  if (added > 0) {
    writeFileSync(path, JSON.stringify(cat, null, 2) + "\n");
    console.log(`${file}: +${added} keys`);
    total += added;
  }
}
console.log(`Done. ${total} keys filled across ${files.length} catalogs.`);

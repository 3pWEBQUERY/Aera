import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORM_FEE_PERCENT, formatPlatformFee } from "@/lib/platform-fee";

describe("platform fee", () => {
  it("matches the Tenant.platformFeePercent default in the Prisma schema", () => {
    // Die Preisseite nennt diese Zahl; der Checkout rechnet mit dem Default
    // aus dem Schema. Driften die beiden auseinander, luegt die Website.
    const schema = readFileSync(join(__dirname, "..", "prisma", "schema.prisma"), "utf8");
    const match = schema.match(/platformFeePercent\s+Float\s+@default\(([\d.]+)\)/);
    expect(match, "platformFeePercent default not found in schema").not.toBeNull();
    expect(Number(match![1])).toBe(PLATFORM_FEE_PERCENT);
  });

  it("formats per locale", () => {
    expect(formatPlatformFee("en")).toBe("5%");
    expect(formatPlatformFee("de").replace(/\s/g, " ")).toBe("5 %");
    expect(formatPlatformFee("de", 2.5).replace(/\s/g, " ")).toBe("2,5 %");
  });
});

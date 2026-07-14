import { describe, it, expect } from "vitest";
import { dnsSatisfiesVerification, txtVerificationValue } from "@/lib/domains";

const base = { rootDomain: "aera.so", tenantId: "t1" };

describe("dnsSatisfiesVerification", () => {
  it("accepts a CNAME pointing at the root domain", () => {
    expect(
      dnsSatisfiesVerification({ ...base, cnames: ["aera.so"], txts: [] }),
    ).toBe(true);
  });

  it("accepts a CNAME pointing at a subdomain of the root", () => {
    expect(
      dnsSatisfiesVerification({ ...base, cnames: ["edge.aera.so"], txts: [] }),
    ).toBe(true);
  });

  it("normalizes trailing dots and case", () => {
    expect(
      dnsSatisfiesVerification({ ...base, cnames: ["AERA.SO."], txts: [] }),
    ).toBe(true);
  });

  it("rejects unrelated CNAME targets (no suffix tricks)", () => {
    expect(
      dnsSatisfiesVerification({ ...base, cnames: ["evilaera.so"], txts: [] }),
    ).toBe(false);
    expect(
      dnsSatisfiesVerification({ ...base, cnames: ["aera.so.evil.com"], txts: [] }),
    ).toBe(false);
  });

  it("accepts the TXT challenge for the right tenant only", () => {
    expect(
      dnsSatisfiesVerification({
        ...base,
        cnames: [],
        txts: [txtVerificationValue("t1")],
      }),
    ).toBe(true);
    expect(
      dnsSatisfiesVerification({
        ...base,
        cnames: [],
        txts: [txtVerificationValue("OTHER")],
      }),
    ).toBe(false);
  });

  it("fails with no records at all", () => {
    expect(dnsSatisfiesVerification({ ...base, cnames: [], txts: [] })).toBe(false);
  });
});

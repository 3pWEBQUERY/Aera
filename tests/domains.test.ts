import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveTxt = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ resolveTxt }));

import { checkDomainDns, dnsSatisfiesVerification, txtVerificationValue } from "@/lib/domains";

beforeEach(() => {
  resolveTxt.mockReset();
});

describe("dnsSatisfiesVerification", () => {
  it("accepts the TXT challenge for the right tenant only", () => {
    expect(
      dnsSatisfiesVerification({ tenantId: "t1", txts: [txtVerificationValue("t1")] }),
    ).toBe(true);
    expect(
      dnsSatisfiesVerification({ tenantId: "t1", txts: [txtVerificationValue("OTHER")] }),
    ).toBe(false);
  });

  it("tolerates surrounding whitespace but no partial matches", () => {
    expect(
      dnsSatisfiesVerification({ tenantId: "t1", txts: [`  ${txtVerificationValue("t1")} `] }),
    ).toBe(true);
    expect(
      dnsSatisfiesVerification({ tenantId: "t1", txts: [`${txtVerificationValue("t1")}0`] }),
    ).toBe(false);
  });

  it("fails with no records at all", () => {
    expect(dnsSatisfiesVerification({ tenantId: "t1", txts: [] })).toBe(false);
  });
});

describe("checkDomainDns", () => {
  it("does not treat a CNAME to the platform as proof of ownership", async () => {
    // Nur ein CNAME (Routing), kein TXT: früher genügte das für jeden Tenant.
    resolveTxt.mockRejectedValue(Object.assign(new Error("ENODATA"), { code: "ENODATA" }));
    await expect(checkDomainDns("community.example.com", "t1")).resolves.toEqual({
      verified: false,
      reason: "txt_missing",
    });
    expect(resolveTxt).toHaveBeenCalledWith("_aera.community.example.com");
  });

  it("rejects another tenant's TXT challenge", async () => {
    resolveTxt.mockResolvedValue([[txtVerificationValue("t2")]]);
    await expect(checkDomainDns("community.example.com", "t1")).resolves.toEqual({
      verified: false,
      reason: "txt_mismatch",
    });
  });

  it("verifies with the tenant-specific TXT record (chunked)", async () => {
    resolveTxt.mockResolvedValue([["aera-verify=", "t1"]]);
    await expect(checkDomainDns("community.example.com", "t1")).resolves.toEqual({
      verified: true,
      reason: "verified",
    });
  });
});

import { describe, expect, it } from "vitest";
import { hasPlatformAdminAccess } from "@/lib/platform-admin";

const eligible = {
  email: "admin@aera.so",
  platformRole: "ADMIN" as const,
  emailVerifiedAt: new Date(),
  totpEnabledAt: new Date(),
  totpSecret: "encrypted-or-base32-secret",
};

describe("platform admin authorization", () => {
  it("requires the durable ADMIN role, verified e-mail and completed TOTP", () => {
    expect(hasPlatformAdminAccess(eligible, [])).toBe(true);
    expect(hasPlatformAdminAccess({ ...eligible, platformRole: "USER" }, [])).toBe(false);
    expect(hasPlatformAdminAccess({ ...eligible, emailVerifiedAt: null }, [])).toBe(false);
    expect(hasPlatformAdminAccess({ ...eligible, totpEnabledAt: null }, [])).toBe(false);
    expect(hasPlatformAdminAccess({ ...eligible, totpSecret: null }, [])).toBe(false);
  });

  it("treats the optional env allowlist only as an additional restriction", () => {
    expect(hasPlatformAdminAccess(eligible, ["admin@aera.so"])).toBe(true);
    expect(hasPlatformAdminAccess(eligible, ["someone-else@aera.so"])).toBe(false);
    expect(
      hasPlatformAdminAccess(
        { ...eligible, platformRole: "USER" },
        ["admin@aera.so"],
      ),
    ).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));
import { canManageTenantMembership } from "@/lib/capabilities";
import { activeRoleAtLeast } from "@/lib/tenant";

describe("tenant capability matrix", () => {
  it("never turns pending or banned staff roles into capabilities", () => {
    expect(activeRoleAtLeast({ role: "OWNER", status: "PENDING" }, "ADMIN")).toBe(false);
    expect(activeRoleAtLeast({ role: "ADMIN", status: "BANNED" }, "ADMIN")).toBe(false);
    expect(activeRoleAtLeast({ role: "ADMIN", status: "ACTIVE" }, "ADMIN")).toBe(true);
  });

  it("lets tenant admins manage members and moderators, but not administrators", () => {
    expect(canManageTenantMembership("ADMIN", "MEMBER", "MODERATOR")).toBe(true);
    expect(canManageTenantMembership("ADMIN", "MODERATOR", "MEMBER")).toBe(true);
    expect(canManageTenantMembership("ADMIN", "MEMBER", "ADMIN")).toBe(false);
    expect(canManageTenantMembership("ADMIN", "ADMIN", "MEMBER")).toBe(false);
  });

  it("reserves administrator management for owners while keeping owners immutable", () => {
    expect(canManageTenantMembership("OWNER", "ADMIN", "MEMBER")).toBe(true);
    expect(canManageTenantMembership("OWNER", "MEMBER", "ADMIN")).toBe(true);
    expect(canManageTenantMembership("OWNER", "OWNER", "ADMIN")).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  tenant: { findUnique: vi.fn() },
};
const setSessionCookie = vi.fn();

vi.mock("@/lib/prisma", () => ({ default: prisma }));
vi.mock("@/lib/session", () => ({ setSessionCookie }));

describe("QA login route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("QA_LOGIN_SECRET", "q".repeat(40));
    vi.stubEnv("AUTH_SECRET", "a".repeat(40));
  });

  afterEach(() => vi.unstubAllEnvs());

  it("never performs a state-changing login over GET", async () => {
    const { GET } = await import("@/app/api/dev/qa-login/route");
    const response = await GET();
    expect(response.status).toBe(404);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it("requires a high-entropy bearer secret", async () => {
    const { POST } = await import("@/app/api/dev/qa-login/route");
    const response = await POST(
      new Request("http://localhost/api/dev/qa-login?slug=demo", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(404);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it("creates a local QA session only after authorization", async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      owner: { id: "user_1", sessionVersion: 4 },
    });
    const { POST } = await import("@/app/api/dev/qa-login/route");
    const response = await POST(
      new Request("http://localhost/api/dev/qa-login?slug=demo", {
        method: "POST",
        headers: { Authorization: `Bearer ${"q".repeat(40)}` },
      }),
    );

    expect(response.status).toBe(307);
    expect(setSessionCookie).toHaveBeenCalledWith({
      userId: "user_1",
      sessionVersion: 4,
    });
  });

  it("stays disabled in production even with the QA secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("@/app/api/dev/qa-login/route");
    const response = await POST(
      new Request("https://preview.example/api/dev/qa-login?slug=demo", {
        method: "POST",
        headers: { Authorization: `Bearer ${"q".repeat(40)}` },
      }),
    );
    expect(response.status).toBe(404);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });
});

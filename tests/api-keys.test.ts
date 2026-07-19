import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return { default: prisma, prisma };
});

import prismaModule from "@/lib/prisma";
const prisma = prismaModule as unknown as PrismaMock;

import { createApiKey, hashApiKey, authenticateApiRequest } from "@/lib/api-keys";

function requestWithAuth(header?: string): Request {
  const headers = new Headers();
  if (header) headers.set("authorization", header);
  return new Request("http://localhost/api/v1/members", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createApiKey", () => {
  it("stores only the hash, never the plaintext key", async () => {
    prisma.apiKey.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: "k1",
      ...args.data,
    }));

    const created = await createApiKey("t1", "Zapier");
    expect(created.key).toMatch(/^aera_sk_[a-f0-9]{48}$/);

    const stored = prisma.apiKey.create.mock.calls[0]![0].data;
    expect(stored.keyHash).toBe(hashApiKey(created.key));
    expect(JSON.stringify(stored)).not.toContain(created.key);
    expect(created.prefix.endsWith("…")).toBe(true);
  });
});

describe("authenticateApiRequest", () => {
  const key = "aera_sk_" + "ab".repeat(24);

  it("rejects missing or malformed Authorization headers", async () => {
    expect(await authenticateApiRequest(requestWithAuth())).toBeNull();
    expect(await authenticateApiRequest(requestWithAuth("Bearer wrong"))).toBeNull();
    expect(await authenticateApiRequest(requestWithAuth(key))).toBeNull(); // ohne "Bearer"
    expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("accepts a valid key and resolves its tenant", async () => {
    prisma.apiKey.findUnique.mockResolvedValue({
      id: "k1",
      revokedAt: null,
      tenant: { id: "t1", slug: "demo", status: "ACTIVE" },
    });
    prisma.apiKey.update.mockResolvedValue({});

    const result = await authenticateApiRequest(requestWithAuth(`Bearer ${key}`));
    expect(result?.tenant.id).toBe("t1");
    expect(prisma.apiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { keyHash: hashApiKey(key) } }),
    );
  });

  it("rejects revoked keys", async () => {
    prisma.apiKey.findUnique.mockResolvedValue({
      id: "k1",
      revokedAt: new Date(),
      tenant: { id: "t1" },
    });
    expect(await authenticateApiRequest(requestWithAuth(`Bearer ${key}`))).toBeNull();
  });

  it("rejects keys belonging to a suspended tenant", async () => {
    prisma.apiKey.findUnique.mockResolvedValue({
      id: "k1",
      revokedAt: null,
      tenant: { id: "t1", slug: "demo", status: "SUSPENDED" },
    });
    expect(await authenticateApiRequest(requestWithAuth(`Bearer ${key}`))).toBeNull();
  });

  it("rejects unknown keys", async () => {
    prisma.apiKey.findUnique.mockResolvedValue(null);
    expect(await authenticateApiRequest(requestWithAuth(`Bearer ${key}`))).toBeNull();
  });
});

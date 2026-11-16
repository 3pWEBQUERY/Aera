import { beforeEach, describe, expect, it, vi } from "vitest";

// In-Memory-Ersatz für die Tabelle TotpRecoveryCode.
type Row = { id: string; userId: string; codeHash: string; usedAt: Date | null };
const db = vi.hoisted(() => ({ rows: [] as Row[], seq: 0 }));

vi.mock("@/lib/prisma", () => {
  const matches = (row: Row, where: Partial<Row>) =>
    Object.entries(where).every(([k, v]) => row[k as keyof Row] === v);
  const table = {
    deleteMany: vi.fn(async ({ where }: { where: Partial<Row> }) => {
      const before = db.rows.length;
      db.rows = db.rows.filter((r) => !matches(r, where));
      return { count: before - db.rows.length };
    }),
    createMany: vi.fn(async ({ data }: { data: Array<{ userId: string; codeHash: string }> }) => {
      for (const d of data) db.rows.push({ id: `c${++db.seq}`, usedAt: null, ...d });
      return { count: data.length };
    }),
    findMany: vi.fn(async ({ where }: { where: Partial<Row> }) =>
      db.rows.filter((r) => matches(r, where)).map((r) => ({ ...r })),
    ),
    count: vi.fn(async ({ where }: { where: Partial<Row> }) =>
      db.rows.filter((r) => matches(r, where)).length,
    ),
    updateMany: vi.fn(
      async ({ where, data }: { where: Partial<Row>; data: Partial<Row> }) => {
        const hit = db.rows.filter((r) => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      },
    ),
  };
  const client = {
    totpRecoveryCode: table,
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { systemPrisma: client, default: client };
});

import {
  RECOVERY_CODE_COUNT,
  consumeRecoveryCode,
  countRecoveryCodes,
  generateRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  matchRecoveryHash,
  normalizeRecoveryCode,
  replaceRecoveryCodes,
} from "@/lib/totp-recovery";

beforeEach(() => {
  db.rows = [];
  db.seq = 0;
});

describe("generate", () => {
  it("creates ten distinct, readable codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const code of codes) {
      expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
      expect(code).not.toMatch(/[01ilo]/);
    }
  });

  it("normalizes case, spaces and dashes", () => {
    const code = generateRecoveryCode();
    const messy = ` ${code.toUpperCase().replace(/-/g, " ")} `;
    expect(normalizeRecoveryCode(messy)).toBe(code.replace(/-/g, ""));
  });
});

describe("hashing", () => {
  it("salts with the user id and never stores the plain code", () => {
    const code = "abcd-efgh-jkmn";
    const a = hashRecoveryCode("u1", code);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("abcd");
    expect(hashRecoveryCode("u2", code)).not.toBe(a);
    expect(hashRecoveryCode("u1", "ABCD EFGH JKMN")).toBe(a);
  });

  it("finds the matching hash or -1", () => {
    const hashes = ["a", "b", "c"].map((c) => hashRecoveryCode("u1", `${c}aaa-bbbb-cccc`));
    expect(matchRecoveryHash(hashes, hashes[1]!)).toBe(1);
    expect(matchRecoveryHash(hashes, hashRecoveryCode("u1", "zzzz-zzzz-zzzz"))).toBe(-1);
  });
});

describe("store / verify / consume", () => {
  it("stores only hashes and replaces old codes", async () => {
    const first = await replaceRecoveryCodes("u1");
    expect(db.rows).toHaveLength(10);
    expect(db.rows.some((r) => first.some((c) => r.codeHash.includes(c)))).toBe(false);

    const second = await replaceRecoveryCodes("u1");
    expect(db.rows).toHaveLength(10);
    expect(await consumeRecoveryCode("u1", first[0]!)).toBe(false);
    expect(await consumeRecoveryCode("u1", second[0]!)).toBe(true);
  });

  it("accepts a code exactly once", async () => {
    const [code] = await replaceRecoveryCodes("u1");
    expect(await countRecoveryCodes("u1")).toBe(10);
    expect(await consumeRecoveryCode("u1", code!.toUpperCase())).toBe(true);
    expect(await consumeRecoveryCode("u1", code!)).toBe(false);
    expect(await countRecoveryCodes("u1")).toBe(9);
  });

  it("rejects another user's code and malformed input", async () => {
    const [code] = await replaceRecoveryCodes("u1");
    await replaceRecoveryCodes("u2");
    expect(await consumeRecoveryCode("u2", code!)).toBe(false);
    expect(await consumeRecoveryCode("u1", "123456")).toBe(false);
    expect(await consumeRecoveryCode("u1", "")).toBe(false);
  });

  it("does not consume twice when two requests race", async () => {
    const [code] = await replaceRecoveryCodes("u1");
    const results = await Promise.all([
      consumeRecoveryCode("u1", code!),
      consumeRecoveryCode("u1", code!),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

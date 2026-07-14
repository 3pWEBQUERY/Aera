import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock, prismaMockRef } = await import("./helpers/prisma-mock");
  const prisma = createPrismaMock();
  prismaMockRef.current = prisma;
  return { default: prisma, prisma };
});
vi.mock("@/lib/ai", () => ({ geminiGenerate: vi.fn(async () => null) }));

import { heuristicVerdict } from "@/lib/moderation";

describe("heuristicVerdict", () => {
  it("passes normal community content", () => {
    expect(
      heuristicVerdict("Danke für den Kurs! Die dritte Lektion fand ich am besten.").flagged,
    ).toBe(false);
    expect(
      heuristicVerdict("Ich sehe das kritisch — der Ansatz hat Schwächen.").flagged,
    ).toBe(false);
  });

  it("flags link spam", () => {
    const v = heuristicVerdict(
      "Schaut mal: https://a.example https://b.example https://c.example https://d.example",
    );
    expect(v.flagged).toBe(true);
    expect(v.category).toBe("spam");
  });

  it("flags classic scam patterns", () => {
    expect(heuristicVerdict("GRATIS GELD mit Bitcoin verdienen!!!").flagged).toBe(true);
    expect(heuristicVerdict("Jetzt klicken und sofort verdienen").flagged).toBe(true);
  });

  it("flags toxic language", () => {
    const v = heuristicVerdict("Du bist so ein Arschloch, halt die Klappe");
    expect(v.flagged).toBe(true);
    expect(v.category).toBe("toxisch");
  });

  it("flags all-caps shouting only in longer texts", () => {
    expect(heuristicVerdict("OK SUPER").flagged).toBe(false);
    expect(
      heuristicVerdict(
        "KAUFT ALLE SOFORT DIESEN UNGLAUBLICHEN KURS SONST VERPASST IHR ALLES FUER IMMER",
      ).flagged,
    ).toBe(true);
  });

  it("ignores HTML markup when scanning", () => {
    expect(heuristicVerdict("<p>Ein ganz normaler <strong>Beitrag</strong>.</p>").flagged).toBe(
      false,
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { count } = vi.hoisted(() => ({ count: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  systemPrisma: { legalAcceptance: { count } },
}));

import { hasCurrentLegalEvidence } from "@/lib/legal-evidence";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  LEGAL_DOCUMENT,
} from "@/lib/legal";

beforeEach(() => vi.clearAllMocks());

describe("current legal evidence", () => {
  it("requires both the current terms and privacy-notice versions", async () => {
    count.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    await expect(hasCurrentLegalEvidence("user-1")).resolves.toBe(false);
    await expect(hasCurrentLegalEvidence("user-1")).resolves.toBe(true);
    expect(count).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        OR: [
          {
            document: LEGAL_DOCUMENT.terms,
            version: CURRENT_TERMS_VERSION,
          },
          {
            document: LEGAL_DOCUMENT.privacyNotice,
            version: CURRENT_PRIVACY_VERSION,
          },
        ],
      },
    });
  });
});

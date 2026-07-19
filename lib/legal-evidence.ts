import "server-only";

import { systemPrisma } from "@/lib/prisma";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  LEGAL_DOCUMENT,
} from "@/lib/legal";

/** Both the contract acceptance and privacy-notice acknowledgement must match. */
export async function hasCurrentLegalEvidence(userId: string): Promise<boolean> {
  const accepted = await systemPrisma.legalAcceptance.count({
    where: {
      userId,
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
  return accepted >= 2;
}

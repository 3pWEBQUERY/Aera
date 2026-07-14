import "server-only";
import { resolveCname, resolveTxt } from "node:dns/promises";
import { env } from "./env";

/**
 * Custom-Domain-Verifizierung per DNS.
 *
 * Zwei akzeptierte Nachweise (einer genügt):
 * 1. **CNAME**: die Domain zeigt auf die Root-Domain (z. B. `aera.so`) oder
 *    eine Subdomain davon — der Traffic kommt also wirklich bei uns an.
 * 2. **TXT**: `_aera.<domain>` enthält `aera-verify=<tenantId>` — Nachweis
 *    der DNS-Kontrolle, z. B. wenn ein Proxy/CDN vor der Domain hängt.
 */

export function txtVerificationValue(tenantId: string): string {
  return `aera-verify=${tenantId}`;
}

/** Reine Auswertung der DNS-Antworten — separat testbar. */
export function dnsSatisfiesVerification(input: {
  cnames: string[];
  txts: string[];
  rootDomain: string;
  tenantId: string;
}): boolean {
  const root = input.rootDomain.toLowerCase();
  const cnameOk = input.cnames.some((c) => {
    const target = c.toLowerCase().replace(/\.$/, "");
    return target === root || target.endsWith(`.${root}`);
  });
  if (cnameOk) return true;
  const expected = txtVerificationValue(input.tenantId);
  return input.txts.some((t) => t.trim() === expected);
}

export interface DomainCheckResult {
  verified: boolean;
  /** Menschlich lesbare Diagnose für die Settings-UI. */
  detail: string;
}

export async function checkDomainDns(
  domain: string,
  tenantId: string,
): Promise<DomainCheckResult> {
  const [cnames, txts] = await Promise.all([
    resolveCname(domain).catch(() => [] as string[]),
    resolveTxt(`_aera.${domain}`)
      .then((rows) => rows.map((chunks) => chunks.join("")))
      .catch(() => [] as string[]),
  ]);

  const verified = dnsSatisfiesVerification({
    cnames,
    txts,
    rootDomain: env.ROOT_DOMAIN,
    tenantId,
  });

  if (verified) return { verified, detail: "DNS-Nachweis gefunden." };
  if (cnames.length === 0 && txts.length === 0) {
    return {
      verified: false,
      detail:
        "Keine passenden DNS-Einträge gefunden. DNS-Änderungen brauchen manchmal bis zu einer Stunde.",
    };
  }
  return {
    verified: false,
    detail: `Gefundene Einträge passen nicht (CNAME: ${cnames.join(", ") || "—"}).`,
  };
}

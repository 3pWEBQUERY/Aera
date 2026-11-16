import "server-only";
import { resolveTxt } from "node:dns/promises";

/**
 * Custom-Domain-Verifizierung per DNS.
 *
 * Nachweis ist allein der mandantenspezifische TXT-Eintrag
 * `_aera.<domain>` = `aera-verify=<tenantId>`. Ein CNAME (bzw. ALIAS/ANAME
 * am Root) auf die Root-Domain sorgt nur für das Routing: er zeigt, dass der
 * Traffic bei uns ankommt, aber nicht, WER die Domain kontrolliert — als
 * Nachweis würde er die Domain jedem Tenant geben, der sie zuerst einträgt.
 */

export function txtVerificationValue(tenantId: string): string {
  return `aera-verify=${tenantId}`;
}

/** Reine Auswertung der DNS-Antworten — separat testbar. */
export function dnsSatisfiesVerification(input: {
  txts: string[];
  tenantId: string;
}): boolean {
  const expected = txtVerificationValue(input.tenantId);
  return input.txts.some((t) => t.trim() === expected);
}

export interface DomainCheckResult {
  verified: boolean;
  /** Grund für die Settings-UI (als Fehler-Key übersetzt). */
  reason: "verified" | "txt_missing" | "txt_mismatch";
}

export async function checkDomainDns(
  domain: string,
  tenantId: string,
): Promise<DomainCheckResult> {
  const txts = await resolveTxt(`_aera.${domain}`)
    .then((rows) => rows.map((chunks) => chunks.join("")))
    .catch(() => [] as string[]);

  if (dnsSatisfiesVerification({ txts, tenantId })) {
    return { verified: true, reason: "verified" };
  }
  return { verified: false, reason: txts.length === 0 ? "txt_missing" : "txt_mismatch" };
}

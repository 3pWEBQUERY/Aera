/**
 * DNS-Einträge, die ein Creator für seine eigene Domain anlegen muss — genau
 * die, die Aera auswertet (siehe lib/domains.ts und app/api/resolve-domain):
 *
 * - Weiterleitung: CNAME (am Root einer Domain: ALIAS/ANAME) auf die
 *   Root-Domain der Plattform. Wird nicht geprüft, bringt aber den Traffic.
 * - Nachweis: TXT `_aera.<domain>` = `aera-verify=<tenantId>`. Nur diesen
 *   Eintrag prüft „Domain prüfen“.
 *
 * Die Namen stehen so da, wie DNS-Anbieter sie erwarten: ohne die Zone.
 */

const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac", "gov", "edu"]);

/** Teilt eine Domain in Vorsilbe (leer = Root) und Zone (z. B. „example.co.uk“). */
export function splitDomain(domain: string): { host: string; zone: string } {
  const parts = domain.toLowerCase().split(".").filter(Boolean);
  const zoneLen =
    parts.length >= 3 &&
    parts[parts.length - 1].length === 2 &&
    SECOND_LEVEL.has(parts[parts.length - 2])
      ? 3
      : 2;
  return {
    host: parts.slice(0, Math.max(0, parts.length - zoneLen)).join("."),
    zone: parts.slice(-zoneLen).join("."),
  };
}

export interface DnsRecordSpec {
  type: string;
  /** Name relativ zur Zone („@“ = Root). */
  name: string;
  /** Vollständiger Name, für Anbieter, die ihn so wollen. */
  fullName: string;
  value: string;
}

export function customDomainRecords(
  domain: string,
  rootDomain: string,
  tenantId: string,
): { route: DnsRecordSpec; txt: DnsRecordSpec; apex: boolean } {
  const { host } = splitDomain(domain);
  return {
    apex: !host,
    route: host
      ? { type: "CNAME", name: host, fullName: domain, value: rootDomain }
      : { type: "ALIAS / ANAME", name: "@", fullName: domain, value: rootDomain },
    txt: {
      type: "TXT",
      name: host ? `_aera.${host}` : "_aera",
      fullName: `_aera.${domain}`,
      value: `aera-verify=${tenantId}`,
    },
  };
}

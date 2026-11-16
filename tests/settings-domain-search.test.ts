import { describe, expect, it } from "vitest";
import { customDomainRecords, splitDomain } from "@/lib/domain-records";
import { matchesWordStart } from "@/lib/dashboard-search";

describe("customDomainRecords", () => {
  it("nennt für eine Subdomain CNAME und TXT relativ zur Zone", () => {
    const r = customDomainRecords("community.example.ch", "aera.so", "t1");
    expect(r.apex).toBe(false);
    expect(r.route).toMatchObject({ type: "CNAME", name: "community", value: "aera.so" });
    expect(r.txt).toMatchObject({
      type: "TXT",
      name: "_aera.community",
      fullName: "_aera.community.example.ch",
      value: "aera-verify=t1",
    });
  });

  it("nimmt am Root ALIAS/ANAME und @", () => {
    const r = customDomainRecords("example.ch", "aera.so", "t1");
    expect(r.apex).toBe(true);
    expect(r.route.name).toBe("@");
    expect(r.txt.name).toBe("_aera");
  });

  it("erkennt zweistufige Endungen als Zone", () => {
    expect(splitDomain("club.example.co.uk")).toEqual({ host: "club", zone: "example.co.uk" });
    expect(splitDomain("example.co.uk")).toEqual({ host: "", zone: "example.co.uk" });
  });
});

describe("matchesWordStart", () => {
  it("trifft nur am Wortanfang", () => {
    expect(matchesWordStart("Automationen", "tom")).toBe(false);
    expect(matchesWordStart("Domain", "dom")).toBe(true);
    expect(matchesWordStart("Eigene Domain", "dom")).toBe(true);
    expect(matchesWordStart("Adresse & Domain", "domain")).toBe(true);
    expect(matchesWordStart("Datenexport", "export")).toBe(false);
    expect(matchesWordStart("Datenexport", "daten")).toBe(true);
  });
});

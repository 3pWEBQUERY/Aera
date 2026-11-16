import { describe, it, expect } from "vitest";
import { matchAcceptLanguage, matchLanguageTag } from "@/i18n/accept-language";

describe("matchLanguageTag", () => {
  it("matches supported locales case-insensitively", () => {
    expect(matchLanguageTag("fr")).toBe("fr");
    expect(matchLanguageTag("PT-br")).toBe("pt-BR");
    expect(matchLanguageTag("zh-hant")).toBe("zh-Hant");
  });

  it("falls back from region to language", () => {
    expect(matchLanguageTag("de-CH")).toBe("de");
    expect(matchLanguageTag("fr-CA")).toBe("fr");
    expect(matchLanguageTag("it-CH")).toBe("it");
  });

  it("maps regional variants we serve separately", () => {
    expect(matchLanguageTag("en-US")).toBe("en");
    expect(matchLanguageTag("en-GB")).toBe("en-GB");
    expect(matchLanguageTag("en-AU")).toBe("en-GB");
    expect(matchLanguageTag("es-ES")).toBe("es");
    expect(matchLanguageTag("es-MX")).toBe("es-419");
    expect(matchLanguageTag("es-419")).toBe("es-419");
    expect(matchLanguageTag("zh-CN")).toBe("zh-Hans");
    expect(matchLanguageTag("zh-TW")).toBe("zh-Hant");
    expect(matchLanguageTag("zh-Hant-HK")).toBe("zh-Hant");
    expect(matchLanguageTag("zh")).toBe("zh-Hans");
    expect(matchLanguageTag("pt-PT")).toBe("pt-BR");
    expect(matchLanguageTag("no")).toBe("nb");
    expect(matchLanguageTag("nn-NO")).toBe("nb");
  });

  it("returns null for unsupported languages and wildcards", () => {
    expect(matchLanguageTag("tr-TR")).toBeNull();
    expect(matchLanguageTag("*")).toBeNull();
    expect(matchLanguageTag("")).toBeNull();
  });
});

describe("matchAcceptLanguage", () => {
  it("honours q-values", () => {
    expect(matchAcceptLanguage("de;q=0.5, fr-CH;q=0.9, en;q=0.8")).toBe("fr");
  });

  it("skips unsupported languages", () => {
    expect(matchAcceptLanguage("tr-TR,tr;q=0.9,en-US;q=0.8")).toBe("en");
  });

  it("keeps header order for equal weights and ignores q=0", () => {
    expect(matchAcceptLanguage("it, fr")).toBe("it");
    expect(matchAcceptLanguage("fr;q=0, ja")).toBe("ja");
  });

  it("returns null when nothing matches or the header is missing", () => {
    expect(matchAcceptLanguage(undefined)).toBeNull();
    expect(matchAcceptLanguage("")).toBeNull();
    expect(matchAcceptLanguage("tr, ar;q=0.5, *;q=0.1")).toBeNull();
  });
});

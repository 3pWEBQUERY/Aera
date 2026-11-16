import { describe, expect, it } from "vitest";
import { formatWhen, parseLocalDateTime, toDateTimeLocalValue } from "@/lib/local-datetime";

// Browser in Europe/Zurich: Winter UTC+1 → getTimezoneOffset() = -60,
// Sommer UTC+2 → -120. Der Server läuft in UTC.
describe("parseLocalDateTime", () => {
  it("rechnet die Wandzeit des Browsers mit seinem Offset nach UTC um", () => {
    expect(parseLocalDateTime("2026-11-20T19:00", "-60")?.toISOString()).toBe(
      "2026-11-20T18:00:00.000Z",
    );
    expect(parseLocalDateTime("2026-07-01T19:00", -120)?.toISOString()).toBe(
      "2026-07-01T17:00:00.000Z",
    );
    // Westlich von UTC (New York, Winter: UTC−5 → +300).
    expect(parseLocalDateTime("2026-01-10T08:30", "300")?.toISOString()).toBe(
      "2026-01-10T13:30:00.000Z",
    );
  });

  it("verschiebt die Zeit beim erneuten Speichern nicht (Rundlauf)", () => {
    // 19:00 in Zürich speichern, im Formular wieder vorbelegen, erneut speichern.
    let input = "2026-11-20T19:00";
    for (let i = 0; i < 3; i++) {
      const stored = parseLocalDateTime(input, -60)!;
      input = toDateTimeLocalValue(stored, -60);
      expect(input).toBe("2026-11-20T19:00");
    }
  });

  it("überquert Datumsgrenzen korrekt", () => {
    expect(parseLocalDateTime("2026-01-01T00:30", -60)?.toISOString()).toBe(
      "2025-12-31T23:30:00.000Z",
    );
    expect(toDateTimeLocalValue(new Date("2025-12-31T23:30:00Z"), -60)).toBe("2026-01-01T00:30");
  });

  it("lehnt leere und ungültige Werte ab", () => {
    expect(parseLocalDateTime("", -60)).toBeNull();
    expect(parseLocalDateTime(null, -60)).toBeNull();
    expect(parseLocalDateTime("2026-13-01T10:00", -60)).toBeNull();
    expect(parseLocalDateTime("2026-11-20T25:00", -60)).toBeNull();
    expect(parseLocalDateTime("kein datum", -60)).toBeNull();
  });

  it("fällt ohne gültigen Offset auf das bisherige Verhalten zurück", () => {
    const expected = new Date("2026-11-20T19:00").toISOString();
    expect(parseLocalDateTime("2026-11-20T19:00", undefined)?.toISOString()).toBe(expected);
    expect(parseLocalDateTime("2026-11-20T19:00", "")?.toISOString()).toBe(expected);
    // Unsinnige Offsets (> 14 h) werden ignoriert statt übernommen.
    expect(parseLocalDateTime("2026-11-20T19:00", 5000)?.toISOString()).toBe(expected);
    // Werte mit eigener Zone bleiben, wie sie sind.
    expect(parseLocalDateTime("2026-11-20T19:00:00Z", -60)?.toISOString()).toBe(
      "2026-11-20T19:00:00.000Z",
    );
  });
});

describe("toDateTimeLocalValue", () => {
  it("liefert leer für fehlende oder ungültige Werte", () => {
    expect(toDateTimeLocalValue(null)).toBe("");
    expect(toDateTimeLocalValue("nope")).toBe("");
  });
});

describe("formatWhen", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  it("zeigt das Jahr nur, wenn es nicht das aktuelle ist", () => {
    const thisYear = formatWhen("2026-12-01T18:00:00Z", "de", now, "Europe/Zurich");
    const nextYear = formatWhen("2027-01-05T18:00:00Z", "de", now, "Europe/Zurich");
    const lastYear = formatWhen("2025-03-05T18:00:00Z", "de", now, "Europe/Zurich");
    expect(thisYear).not.toMatch(/2026/);
    expect(thisYear).toMatch(/19:00/);
    expect(nextYear).toMatch(/2027/);
    expect(lastYear).toMatch(/2025/);
  });
});

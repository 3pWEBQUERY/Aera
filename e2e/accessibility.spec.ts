import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Automatische Pruefung der oeffentlichen Seiten gegen WCAG 2.1 AA.
 *
 * Automatik findet nicht alles — Tastaturreihenfolge, sinnvolle Beschriftungen
 * und Fokusfuehrung bleiben Handarbeit. Was sie aber zuverlaessig findet, sind
 * die stillen Rueckschritte: ein Kontrast, der beim Umfaerben unter die Grenze
 * rutscht, eine Ueberschriftsebene, die beim Umbauen uebersprungen wird, ein
 * Bild, dessen Alternativtext beim Kopieren verloren ging.
 *
 * Bewusst nur die Seiten ohne Anmeldung: sie sind die, die jeder sieht, und
 * sie laufen ohne Testdaten. Das angemeldete Konto deckt
 * account-accessibility.spec.ts ab.
 */

const PAGES = [
  { path: "/", name: "Startseite" },
  { path: "/login", name: "Anmeldung" },
  { path: "/signup", name: "Registrierung" },
  { path: "/pricing", name: "Preise" },
  { path: "/features", name: "Funktionen" },
  { path: "/hilfe", name: "Hilfe" },
];

for (const page_ of PAGES) {
  test(`${page_.name} hat keine Verstoesse gegen WCAG 2.1 AA`, async ({ page }) => {
    await page.goto(page_.path, { waitUntil: "domcontentloaded" });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    // Bei einem Fehlschlag soll im Log stehen, *was* kaputt ist — eine blosse
    // Zahl schickt jeden erst wieder in den Report.
    const summary = results.violations.map(
      (v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length}x\n    ${v.nodes[0]?.target.join(" ")}`,
    );
    expect(summary, summary.join("\n  ")).toEqual([]);
  });
}

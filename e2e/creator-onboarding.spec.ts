import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Der Kernweg eines neuen Creators, wie im Cognitive Walkthrough
 * (docs/ux/creator-onboarding-walkthrough.md): Startseite -> Registrierung ->
 * Wizard -> Dashboard -> erster Beitrag.
 *
 * Haelt zwei frueher gefundene Fehler fest:
 * - "Weiter" in Schritt 4 legte die Community sofort an und uebersprang die
 *   Uebersicht (der Button wurde im selben Klick zum Submit-Button).
 * - Das Dashboard zeigte einem neuen Creator zuerst den Upsell und keinen
 *   Weg zum ersten Beitrag.
 */
test("ein neuer Creator kommt ohne Umweg zum ersten Beitrag", async ({ page }) => {
  test.setTimeout(240_000);
  const email = `creator-${Date.now()}@aera.test`;
  const communityName = `Testraum ${Date.now().toString(36)}`;

  await page.goto("/");
  await page.getByRole("link", { name: "Community kostenlos starten" }).click();
  await expect(page).toHaveURL(/\/signup\?next=%2Fstart|\/signup\?next=\/start/);

  await page.getByLabel("Name", { exact: true }).fill("Test Creator");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill("Sicheres-Passwort-42");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Konto erstellen" }).click();
  await expect(page).toHaveURL(/\/start/, { timeout: 120_000 });

  // Schritt 1: "Weiter" ohne Namen erklaert, was fehlt, statt still zu bleiben.
  await page.getByRole("button", { name: /Weiter/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Namen" })).toBeVisible();
  await expect(page.getByLabel("Name der Community")).toBeFocused();
  await page.getByLabel("Name der Community").fill(communityName);

  for (let step = 2; step <= 5; step++) {
    await page.getByRole("button", { name: /Weiter/ }).click();
  }
  // Schritt 5 ist die Uebersicht — noch nichts angelegt.
  await expect(page.getByRole("heading", { name: "Alles bereit?" })).toBeVisible();
  await expect(page).toHaveURL(/\/start/);

  await page.getByRole("button", { name: "Community erstellen" }).click();
  await expect(page).toHaveURL(/\/dashboard\/[a-z0-9-]+$/, { timeout: 120_000 });

  // Das Dashboard fuehrt zum ersten Beitrag.
  await expect(page.getByRole("heading", { name: "Erste Schritte" })).toBeVisible();
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

  await page.getByRole("link", { name: "Beitrag schreiben" }).click();
  await expect(page).toHaveURL(/\/spaces\//, { timeout: 120_000 });
  await page.getByRole("button", { name: "Beitrag erstellen" }).first().click();
  await page.getByRole("dialog").getByLabel("Text", { exact: true }).fill("Willkommen!");
  await page.getByRole("dialog").getByRole("button", { name: "Beitrag erstellen" }).click();
  await expect(page.getByText("Willkommen!")).toBeVisible({ timeout: 60_000 });

  // Loeschen fragt nach, der Standard ist Behalten.
  await page.getByRole("button", { name: "Löschen" }).first().click();
  await expect(page.getByText("Beitrag endgültig löschen?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Abbrechen" }).first()).toBeFocused();
});

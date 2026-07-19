import { expect, test } from "@playwright/test";

const qaSecret = "ci-qa-login-secret-012345678901234567890123";
const tenantSlug = process.env.E2E_TENANT_SLUG ??
  (process.env.CI ? "aera-ci-community" : "sex-studio");

test("account exposes protected export and deletion controls", async ({ page }) => {
  const login = await page.request.post(
    `/api/dev/qa-login?slug=${tenantSlug}`,
    {
      headers: { authorization: `Bearer ${qaSecret}` },
      maxRedirects: 0,
    },
  );
  expect(login.status()).toBe(307);

  await page.goto("/member/account?tab=einstellungen");
  await expect(page.getByRole("link", { name: "Daten herunterladen" })).toHaveAttribute(
    "href",
    "/api/account/export",
  );
  await expect(page.getByLabel("E-Mail-Adresse bestätigen")).toBeVisible();
  await expect(page.locator("#account-delete-password")).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  await expect(page.getByRole("button", { name: "Konto löschen" })).toBeDisabled();

  await page.goto("/legal/accept?next=%2Fhome");
  await expect(page.getByRole("heading", { name: "Aktuelle Bedingungen prüfen" })).toBeVisible();
  const acceptance = page.locator('input[name="legalAcceptance"]');
  await expect(acceptance).toHaveAttribute("required", "");
  await expect(acceptance).not.toBeChecked();
});

test("public forms provide a skip target, names and unique ids", async ({ page }) => {
  await page.goto("/signup");
  const skipLink = page.getByRole("link", { name: "Zum Hauptinhalt springen" });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toHaveAttribute("href", "#main-content");
  await expect(page.locator("#main-content")).toHaveCount(1);

  await expect(page.getByLabel("Name")).toBeVisible();
  await expect(page.getByLabel("E-Mail")).toBeVisible();
  await expect(page.getByLabel("Passwort")).toBeVisible();

  const duplicateIds = await page.locator("[id]").evaluateAll((elements) => {
    const ids = elements.map((element) => element.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  expect(duplicateIds).toEqual([]);
});

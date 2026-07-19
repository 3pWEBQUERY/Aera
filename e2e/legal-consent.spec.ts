import { expect, test } from "@playwright/test";

const tenantSlug = process.env.E2E_TENANT_SLUG ??
  (process.env.CI ? "aera-ci-community" : "sex-studio");

test("signup requires legal acceptance without coupling marketing consent", async ({ page }) => {
  await page.goto("/signup");

  await expect(page.getByRole("heading", { name: "Ein Konto. Alle Communities." })).toBeVisible();
  const legal = page.locator('input[name="legalAcceptance"]');
  await expect(legal).toHaveCount(1);
  await expect(legal).toHaveAttribute("required", "");
  await expect(legal).not.toBeChecked();
  await expect(page.getByRole("link", { name: "Allgemeinen Geschäftsbedingungen" })).toHaveAttribute(
    "href",
    "/agb",
  );
  await expect(page.getByRole("link", { name: "Datenschutzhinweis" })).toHaveAttribute(
    "href",
    "/datenschutz",
  );
  await expect(page.locator('input[name="newsletterOptIn"]')).toHaveCount(0);

  await page.getByLabel("Name").fill("E2E Legal Check");
  await page.getByLabel("E-Mail").fill("e2e-legal@example.test");
  await page.getByLabel("Passwort").fill("E2E-only-password-2026!");
  await page.getByRole("button", { name: "Konto erstellen" }).click();
  await expect(legal).toBeFocused();
  await expect(page).toHaveURL(/\/signup$/);
});

test("community signup keeps newsletter optional and paid access consent separate", async ({ page }) => {
  await page.goto(`/c/${tenantSlug}/join`);

  const legal = page.locator('input[name="legalAcceptance"]');
  const newsletter = page.locator('input[name="newsletterOptIn"]');
  const immediateAccess = page.locator('input[name="immediatePerformanceConsent"]');

  await expect(legal).toHaveAttribute("required", "");
  await expect(legal).not.toBeChecked();
  await expect(newsletter).not.toHaveAttribute("required", "");
  await expect(newsletter).not.toBeChecked();
  await expect(immediateAccess).toHaveCount(1);
  await expect(immediateAccess).toHaveAttribute("required", "");
  await expect(immediateAccess).not.toBeChecked();
  await expect(page.getByRole("link", { name: "Details" })).toHaveAttribute(
    "href",
    "/widerruf",
  );
});

test("legal and unsubscribe pages expose the implemented disclosures", async ({ page }) => {
  await page.goto("/datenschutz");
  await expect(page.getByRole("heading", { name: "Datenschutzerklärung" })).toBeVisible();
  await expect(page.getByText("separate, freiwillige Einwilligung", { exact: false })).toBeVisible();
  await expect(page.getByText("strukturierten, maschinenlesbaren Format", { exact: false })).toBeVisible();

  await page.goto("/widerruf");
  await expect(
    page.getByRole("heading", { name: "Erlöschen des Widerrufsrechts bei digitalen Inhalten" }),
  ).toBeVisible();

  await page.goto("/unsubscribe/invalid-token");
  await expect(page.getByRole("heading", { name: "Newsletter abbestellen" })).toBeVisible();
  await expect(page.getByText("Dieser Abmeldelink ist ungültig", { exact: false })).toBeVisible();
});

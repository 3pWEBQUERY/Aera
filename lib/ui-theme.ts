import type { CSSProperties } from "react";

/**
 * Aera-eigene Seiten, die die Tinte als Markenfarbe fahren: Login,
 * Registrierung, Passwort vergessen und das Mitgliedskonto.
 *
 * `--brand` bleibt dort Tinte — es faerbt Links, Checkboxen und Fokusringe.
 * Der gefuellte CTA ist aber kein Markenbutton, sondern ein Aktionsbutton und
 * folgt deshalb `--primary`. Innerhalb einer Community bleiben diese Variablen
 * ungesetzt, dort faellt der CTA wie bisher auf die Farbe des Creators zurueck.
 */
export const AERA_INK_VARS = {
  "--brand": "#161613",
  "--cta-bg": "var(--primary)",
  "--cta-fg": "var(--primary-fg)",
  "--cta-hover": "var(--primary-hover)",
} as CSSProperties;

/**
 * Creator-Dashboard: gefuellte `<Button>`s sind Aktionen der Plattform, nicht
 * die Markenfarbe der Community — sie tragen dieselbe Tinte wie alle anderen
 * Haupt-Buttons im Dashboard.
 */
export const AERA_DASHBOARD_VARS = {
  "--cta-bg": "var(--primary)",
  "--cta-fg": "var(--primary-fg)",
  "--cta-hover": "var(--primary-hover)",
} as CSSProperties;

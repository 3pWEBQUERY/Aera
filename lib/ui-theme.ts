import type { CSSProperties } from "react";

/**
 * Aera-eigene Seiten, die die Tinte als Markenfarbe fahren: Login,
 * Registrierung, Passwort vergessen und das Mitgliedskonto.
 *
 * `--brand` bleibt dort Tinte — es faerbt Links, Checkboxen und Fokusringe.
 * Der gefuellte CTA ist aber kein Markenbutton, sondern ein Aktionsbutton und
 * folgt deshalb `--action`. Innerhalb einer Community bleiben diese Variablen
 * ungesetzt, dort faellt der CTA wie bisher auf die Farbe des Creators zurueck.
 */
export const AERA_INK_VARS = {
  "--brand": "#161613",
  "--cta-bg": "var(--action)",
  "--cta-fg": "var(--action-fg)",
  "--cta-hover": "var(--action-hover)",
} as CSSProperties;

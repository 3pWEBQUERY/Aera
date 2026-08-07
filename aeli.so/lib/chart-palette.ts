/**
 * Die Farben der Statistik — und warum sie nicht die Markenfarben sind.
 *
 * Aelis Signalgrün (#c9f24d) ist als Datenfarbe ungeeignet: es liegt weit über
 * dem Helligkeitsband, in dem sich zwei Serien auf dunklem Grund noch
 * unterscheiden lassen, und mit einer zweiten warmen Farbe daneben fällt es
 * bei Rot-Grün-Sehschwäche mit ihr zusammen (geprüft: ΔE 4,0 unter Deuteranopie
 * — jede zwanzigste männliche Person sähe eine Fläche statt zwei Linien).
 *
 * Deshalb tragen Daten hier eine eigene, geprüfte Palette: Blau und Orange,
 * die klassische Paarung, die auch ohne Farbsehen auseinanderfällt. Grün kommt
 * als dritter Slot nur dort dazu, wo drei Kategorien nebeneinander stehen.
 *
 * Geprüft gegen die Studio-Fläche #101015:
 *   Helligkeitsband ✓  Chroma ✓  CVD-Abstand ✓  Kontrast ≥ 3:1 ✓
 *   schlechtestes Paar (alle Paare): ΔE 9,4 Deuteranopie / 20,9 Normalsicht
 *
 * Die Marke bleibt trotzdem sichtbar — nur in der Oberfläche drumherum
 * (Knöpfe, Fokus, aktive Reiter), nicht in den Daten.
 */
export const CHART = {
  /** Slot 1 — Aufrufe. */
  views: "#3987e5",
  /** Slot 2 — Klicks. */
  clicks: "#d95926",
  /** Slot 3 — nur für die dritte Kategorie in Verteilungen. */
  third: "#199e70",
  /** Gitter und Achsen bleiben zurückhaltend: sie sind Orientierung, nicht Inhalt. */
  grid: "#24242d",
  axis: "#8f8f9c",
} as const;

import { newBlockId, type PageBlock } from "./community-pages";
import type { IconName } from "@/components/dashboard/icons";

/**
 * Vorlagen fuer frei gebaute Seiten.
 *
 * Eine Vorlage ist ein Geruest, kein fertiger Text. Die Platzhalter sind
 * bewusst kurz und erkennbar als Platzhalter geschrieben — wer eine Seite
 * anlegt, soll ausfuellen und nicht erst drei Absaetze Blindtext wegloeschen.
 * Genau daran scheitern die meisten Vorlagensysteme: sie liefern etwas, das
 * fertig aussieht, aber niemanden beschreibt.
 *
 * Die Texte kommen als Uebersetzungen herein und werden beim Anlegen in die
 * Sprache des Creators aufgeloest. Danach sind sie gewoehnlicher Inhalt — eine
 * spaetere Sprachumstellung ruehrt eine bestehende Seite nicht mehr an, und
 * das ist richtig so: es ist sein Text, nicht unserer.
 */

export const PAGE_TEMPLATES = [
  "BLANK",
  "ABOUT",
  "FAQ",
  "MEMBERSHIP",
  "WORK",
  "RULES",
  "CONTACT",
] as const;

export type PageTemplateKey = (typeof PAGE_TEMPLATES)[number];

export const TEMPLATE_ICON: Record<PageTemplateKey, IconName> = {
  BLANK: "plus",
  ABOUT: "members",
  FAQ: "info",
  MEMBERSHIP: "tiers",
  WORK: "gallery",
  RULES: "lock",
  CONTACT: "send",
};

/** Ein Uebersetzer, wie ihn `useTranslations` und `getTranslations` liefern. */
type Translate = (key: string) => string;

const id = () => newBlockId();

/** Absaetze zu dem HTML, das der Textbaustein erwartet. */
function paragraphs(...lines: string[]): string {
  return lines.map((line) => `<p>${line}</p>`).join("");
}

/** Aufzaehlung fuer den Textbaustein. */
function bullets(...lines: string[]): string {
  return `<ul>${lines.map((line) => `<li>${line}</li>`).join("")}</ul>`;
}

/**
 * Baut die Bausteine einer Vorlage.
 *
 * `slug` fliesst in die Ziele der Handlungsaufrufe: eine Vorlage, deren Knopf
 * ins Leere zeigt, muesste der Creator als Erstes reparieren.
 */
export function templateBlocks(
  key: PageTemplateKey,
  t: Translate,
  slug: string,
): PageBlock[] {
  switch (key) {
    case "BLANK":
      return [];

    case "ABOUT":
      return [
        {
          id: id(),
          type: "TEXT",
          title: t("aboutIntroTitle"),
          html: paragraphs(t("aboutIntroBody"), t("aboutIntroBody2")),
        },
        { id: id(), type: "IMAGE", url: "", alt: "", caption: t("aboutImageCaption"), width: "WIDE" },
        {
          id: id(),
          type: "STATS",
          title: t("aboutStatsTitle"),
          items: [
            { id: id(), value: "—", label: t("aboutStat1") },
            { id: id(), value: "—", label: t("aboutStat2") },
            { id: id(), value: "—", label: t("aboutStat3") },
          ],
        },
        { id: id(), type: "QUOTE", text: t("aboutQuote"), author: "", role: "" },
        {
          id: id(),
          type: "CTA",
          title: t("aboutCtaTitle"),
          text: t("aboutCtaText"),
          label: t("aboutCtaLabel"),
          href: `/c/${slug}/join`,
          style: "SOLID",
        },
      ];

    case "FAQ":
      return [
        { id: id(), type: "TEXT", title: "", html: paragraphs(t("faqIntro")) },
        {
          id: id(),
          type: "FAQ",
          title: t("faqTitle"),
          items: [
            { id: id(), question: t("faqQ1"), answer: t("faqA1") },
            { id: id(), question: t("faqQ2"), answer: t("faqA2") },
            { id: id(), question: t("faqQ3"), answer: t("faqA3") },
            { id: id(), question: t("faqQ4"), answer: t("faqA4") },
          ],
        },
        {
          id: id(),
          type: "CTA",
          title: t("faqCtaTitle"),
          text: t("faqCtaText"),
          label: t("faqCtaLabel"),
          href: `/c/${slug}`,
          style: "OUTLINE",
        },
      ];

    case "MEMBERSHIP":
      return [
        {
          id: id(),
          type: "TEXT",
          title: t("memberIntroTitle"),
          html: paragraphs(t("memberIntroBody")),
        },
        {
          id: id(),
          type: "LINKS",
          title: t("memberLinksTitle"),
          items: [
            { id: id(), label: t("memberLink1"), description: t("memberLink1Hint"), href: "" },
            { id: id(), label: t("memberLink2"), description: t("memberLink2Hint"), href: "" },
            { id: id(), label: t("memberLink3"), description: t("memberLink3Hint"), href: "" },
          ],
        },
        { id: id(), type: "DIVIDER", style: "LINE" },
        {
          id: id(),
          type: "CTA",
          title: t("memberCtaTitle"),
          text: t("memberCtaText"),
          label: t("memberCtaLabel"),
          href: `/c/${slug}/join`,
          style: "SOLID",
        },
      ];

    case "WORK":
      return [
        {
          id: id(),
          type: "TEXT",
          title: t("workIntroTitle"),
          html: paragraphs(t("workIntroBody")),
        },
        { id: id(), type: "GALLERY", title: t("workGalleryTitle"), layout: "GRID", images: [] },
        { id: id(), type: "DIVIDER", style: "SPACE" },
        { id: id(), type: "VIDEO", url: "", posterUrl: "", title: t("workVideoTitle"), caption: "" },
      ];

    case "RULES":
      return [
        {
          id: id(),
          type: "TEXT",
          title: t("rulesIntroTitle"),
          html: paragraphs(t("rulesIntroBody")),
        },
        {
          id: id(),
          type: "TEXT",
          title: t("rulesListTitle"),
          html: bullets(t("rulesItem1"), t("rulesItem2"), t("rulesItem3"), t("rulesItem4")),
        },
        {
          id: id(),
          type: "TEXT",
          title: t("rulesConsequencesTitle"),
          html: paragraphs(t("rulesConsequencesBody")),
        },
      ];

    case "CONTACT":
      return [
        {
          id: id(),
          type: "TEXT",
          title: t("contactIntroTitle"),
          html: paragraphs(t("contactIntroBody")),
        },
        {
          id: id(),
          type: "LINKS",
          title: t("contactLinksTitle"),
          items: [
            { id: id(), label: t("contactLink1"), description: t("contactLink1Hint"), href: "" },
            { id: id(), label: t("contactLink2"), description: t("contactLink2Hint"), href: "" },
          ],
        },
        {
          id: id(),
          type: "CTA",
          title: t("contactCtaTitle"),
          text: t("contactCtaText"),
          label: t("contactCtaLabel"),
          href: `/c/${slug}`,
          style: "OUTLINE",
        },
      ];
  }
}

/**
 * Die Texte der oeffentlichen Seite.
 *
 * Bewusst OHNE `server-only` und ohne Next-Importe: die Bio-Seite wird auch im
 * Studio gerendert, und zwar in einer Client-Komponente (Live-Vorschau). Laege
 * diese Tabelle in `lib/i18n.ts`, zoege sie `next/headers` in das Client-Bundle
 * — und der Build braeche mit einem Fehler, der wie ein Importproblem aussieht,
 * aber ein Architekturproblem ist.
 *
 * Hier stehen nur Daten. Welche Sprache gilt, entscheidet `lib/i18n.ts`.
 */

export const PUBLIC_STRINGS = {
  de: {
    /**
     * Das BCP-47-Kuerzel dieses Satzes. Preise und Zahlen werden damit in den
     * Komponenten formatiert; ohne diesen Eintrag muesste jede davon raten
     * oder Deutsch annehmen.
     */
    locale: "de-DE",
    newsletterPlaceholder: "Deine E-Mail-Adresse",
    newsletterButton: "Eintragen",
    newsletterDone: "Danke! Du bist dabei.",
    namePlaceholder: "Dein Name",
    messagePlaceholder: "Deine Nachricht",
    contactButton: "Absenden",
    contactDone: "Danke, deine Nachricht ist angekommen.",
    genericError: "Das hat leider nicht geklappt. Versuch es noch einmal.",
    invalidEmail: "Bitte gib eine gültige E-Mail-Adresse ein.",
    gatePasswordTitle: "Diese Seite ist geschützt",
    gatePasswordHint: "Gib das Passwort ein, das du bekommen hast.",
    gatePasswordPlaceholder: "Passwort",
    gateAgeTitle: "Bist du 18 oder älter?",
    gateAgeHint: "Diese Seite enthält Inhalte für Erwachsene.",
    gateAgeYes: "Ja, ich bin 18+",
    gateAgeNo: "Nein",
    gateEmailTitle: "Kurz eintragen, dann geht's weiter",
    gateEmailHint: "Deine Adresse bekommt nur der Ersteller dieser Seite.",
    gateUnlock: "Weiter",
    gateWrong: "Das war leider nicht richtig.",
    liveNow: "Jetzt live",
    tipThanks: "Danke! Dein Trinkgeld ist angekommen.",
    tipCancelled: "Abgebrochen — es wurde nichts abgebucht.",
    aeraEvents: "Termine",
    aeraTiers: "Mitglied werden",
    aeraShop: "Shop",
    aeraCourses: "Kurse",
    aeraSpaces: "In der Community",
    aeraEventOnline: "Online",
    tierFree: "kostenlos",
    tierMonth: "pro Monat",
    tierYear: "pro Jahr",
    tierOnce: "einmalig",
    tierRecommended: "Empfohlen",
    shareTitle: "Seite teilen",
    shareCopy: "Adresse kopieren",
    shareCopied: "Kopiert",
    joinCommunity: "Community beitreten",
    poweredBy: "Erstellt mit",
    createYours: "Mach dir deine eigene Seite",
    notFoundTitle: "Diese Seite gibt es (noch) nicht",
    notFoundBody: "Der Handle ist frei — vielleicht ja für dich.",
    notFoundCta: "Handle sichern",
  },
  en: {
    locale: "en-GB",
    newsletterPlaceholder: "Your email address",
    newsletterButton: "Subscribe",
    newsletterDone: "Thanks — you're in.",
    namePlaceholder: "Your name",
    messagePlaceholder: "Your message",
    contactButton: "Send",
    contactDone: "Thanks, your message came through.",
    genericError: "That didn't work. Please try again.",
    invalidEmail: "Please enter a valid email address.",
    gatePasswordTitle: "This page is protected",
    gatePasswordHint: "Enter the password you were given.",
    gatePasswordPlaceholder: "Password",
    gateAgeTitle: "Are you 18 or older?",
    gateAgeHint: "This page contains adult content.",
    gateAgeYes: "Yes, I'm 18+",
    gateAgeNo: "No",
    gateEmailTitle: "One quick step",
    gateEmailHint: "Only the owner of this page receives your address.",
    gateUnlock: "Continue",
    gateWrong: "That wasn't right.",
    liveNow: "Live now",
    tipThanks: "Thank you! Your tip came through.",
    tipCancelled: "Cancelled — nothing was charged.",
    aeraEvents: "Upcoming",
    aeraTiers: "Become a member",
    aeraShop: "Shop",
    aeraCourses: "Courses",
    aeraSpaces: "Inside the community",
    aeraEventOnline: "Online",
    tierFree: "free",
    tierMonth: "per month",
    tierYear: "per year",
    tierOnce: "one-time",
    tierRecommended: "Recommended",
    shareTitle: "Share page",
    shareCopy: "Copy address",
    shareCopied: "Copied",
    joinCommunity: "Join the community",
    poweredBy: "Made with",
    createYours: "Make your own page",
    notFoundTitle: "This page doesn't exist (yet)",
    notFoundBody: "The handle is still free — maybe for you.",
    notFoundCta: "Claim a handle",
  },
} as const;

export type PublicLocale = keyof typeof PUBLIC_STRINGS;
/**
 * Bewusst auf `string` geweitet: `as const` macht sonst aus jedem deutschen
 * Wert einen eigenen Literaltyp, und die englische Tabelle passt dann per
 * Definition nicht mehr dazu. Die Schluessel bleiben streng — genau das ist der
 * Teil, der beim Uebersetzen schiefgeht.
 */
export type PublicStrings = Record<keyof (typeof PUBLIC_STRINGS)["de"], string>;

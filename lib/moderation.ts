import "server-only";
import prisma from "./prisma";
import { features } from "./env";
import { geminiGenerate } from "./ai";

/**
 * KI-Moderation: neue Beiträge/Kommentare werden automatisch klassifiziert.
 *
 * - Mit Gemini-Key: LLM-Klassifikation (spam / toxisch / belaestigung / ok).
 * - Ohne Key: transparente Heuristik (Link-Spam, Caps-Schreien, Wortliste).
 *
 * Treffer landen als ModerationFlag (PENDING) im Dashboard unter „Moderation".
 * Inhalte werden NIE automatisch gelöscht — die Entscheidung trifft das Team.
 * Alles ist best effort: Moderationsfehler blockieren nie das Posten.
 */

export interface ModerationVerdict {
  flagged: boolean;
  category: string;
  reason: string;
}

const SPAM_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /(https?:\/\/[^\s]+[\s,;]*){4,}/i, reason: "Ungewöhnlich viele Links" },
  { re: /\b(gratis|kostenlos)\b.{0,30}\b(geld|gewinn|bitcoin|crypto)\b/i, reason: "Typisches Spam-Muster (Gratis-Geld)" },
  { re: /\b(click here|jetzt klicken|sofort verdienen|schnell reich)\b/i, reason: "Typisches Spam-Muster (Klickköder)" },
  { re: /(.)\1{9,}/, reason: "Exzessive Zeichenwiederholung" },
  { re: /\b(viagra|casino bonus|forex signals?)\b/i, reason: "Bekannte Spam-Begriffe" },
];

const TOXIC_WORDS = [
  "arschloch", "hurensohn", "missgeburt", "fick dich", "verpiss dich",
  "wichser", "fotze", "schlampe", "bastard", "idiot von",
  "kill yourself", "kys", "fuck you", "asshole", "bitch",
];

/** Reine Heuristik — separat testbar, keine externen Aufrufe. */
export function heuristicVerdict(text: string): ModerationVerdict {
  const plain = text.replace(/<[^>]+>/g, " ");

  for (const p of SPAM_PATTERNS) {
    if (p.re.test(plain)) {
      return { flagged: true, category: "spam", reason: p.reason };
    }
  }

  const lower = plain.toLowerCase();
  for (const word of TOXIC_WORDS) {
    if (lower.includes(word)) {
      return {
        flagged: true,
        category: "toxisch",
        reason: `Anstößige Formulierung erkannt („${word}“)`,
      };
    }
  }

  // Caps-Schreien: lange Texte, die fast nur aus Großbuchstaben bestehen.
  const letters = plain.replace(/[^a-zA-ZäöüÄÖÜß]/g, "");
  if (letters.length >= 40) {
    const upper = letters.replace(/[^A-ZÄÖÜ]/g, "").length;
    if (upper / letters.length > 0.85) {
      return { flagged: true, category: "spam", reason: "Durchgehende Großschreibung" };
    }
  }

  return { flagged: false, category: "ok", reason: "" };
}

async function geminiVerdict(text: string): Promise<ModerationVerdict | null> {
  const prompt = `Du bist ein Moderations-Klassifikator für eine deutschsprachige Community-Plattform.
Klassifiziere den folgenden Nutzerinhalt. Antworte AUSSCHLIESSLICH mit einem JSON-Objekt:
{"category":"ok"|"spam"|"toxisch"|"belaestigung","reason":"<max 12 Wörter, deutsch>"}

Regeln: "spam" = Werbung, Scam, Linkschleudern. "toxisch" = Beleidigungen, Hass.
"belaestigung" = gezielte Angriffe auf Personen. Im Zweifel "ok" — normale Kritik,
Ironie und derbe Umgangssprache unter Erwachsenen sind KEIN Verstoß.

Inhalt:
"""${text.slice(0, 2000)}"""`;

  const raw = await geminiGenerate(prompt, 100);
  if (!raw) return null;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { category?: string; reason?: string };
    const category = (parsed.category ?? "ok").toLowerCase();
    if (!["ok", "spam", "toxisch", "belaestigung"].includes(category)) return null;
    return {
      flagged: category !== "ok",
      category,
      reason: (parsed.reason ?? "").slice(0, 200),
    };
  } catch {
    return null;
  }
}

/**
 * Prüft neuen Inhalt und legt bei Verstößen ein ModerationFlag an.
 * Wirft nie — Aufrufer müssen nichts behandeln.
 */
export async function moderateContent(input: {
  tenantId: string;
  refType: "Post" | "Comment";
  refId: string;
  authorId: string;
  text: string;
}): Promise<void> {
  try {
    const text = input.text.trim();
    if (text.length < 3) return;

    let verdict: ModerationVerdict | null = null;
    let source = "heuristik";
    if (features.gemini) {
      verdict = await geminiVerdict(text);
      if (verdict) source = "gemini";
    }
    if (!verdict) verdict = heuristicVerdict(text);
    if (!verdict.flagged) return;

    await prisma.moderationFlag
      .create({
        data: {
          tenantId: input.tenantId,
          refType: input.refType,
          refId: input.refId,
          authorId: input.authorId,
          category: verdict.category,
          reason: verdict.reason,
          source,
          excerpt: text.replace(/\s+/g, " ").slice(0, 240),
        },
      })
      .catch(() => undefined); // unique(tenant,refType,refId) -> Duplikate ok
  } catch (e) {
    console.error("moderateContent failed:", e);
  }
}

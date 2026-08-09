"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { parseTipAmount } from "@/lib/tip-amount";
import { startTip, TIP_PROBLEM_TEXT } from "@/lib/tips";
import { formError, text, type FormState } from "@/lib/action-state";

/**
 * Der Knopf „Danke sagen" auf einer fremden Bio-Seite.
 *
 * Ohne Anmeldung, mit Absicht: wer zwei Euro geben will, legt dafuer kein
 * Konto an. Die Kehrseite ist, dass hier jeder Besucher schreibt — deshalb
 * eine Grenze pro Herkunft, und deshalb prueft `lib/tips.ts` jede Bedingung
 * selbst, statt sich auf das Formular zu verlassen.
 */
export async function startTipAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ip = clientIp(await headers());
  // Eine Zahlung zu beginnen legt eine Zeile an und ruft Stripe. Beides ist
  // teurer als ein Seitenaufruf, also enger begrenzt.
  if (!rateLimit(`tip:${ip}`, 10, 10 * 60_000).ok) {
    return formError("Zu viele Versuche. Bitte kurz warten.");
  }

  const result = await startTip({
    handle: text(form, "handle", 40),
    blockId: text(form, "blockId", 40),
    amountCents: parseTipAmount(text(form, "amount", 20)),
    message: text(form, "message", 400),
  });

  if (!result.ok) {
    // Der Betrag ist das einzige Feld, das der Besucher ausfuellt — ein Fehler
    // daran gehoert an das Feld, nicht in eine Zeile darueber.
    const atField =
      result.problem === "invalid-amount" ||
      result.problem === "amount-too-small" ||
      result.problem === "amount-too-large";
    return atField
      ? { fieldErrors: { amount: TIP_PROBLEM_TEXT[result.problem] } }
      : formError(TIP_PROBLEM_TEXT[result.problem]);
  }

  // Nach aussen, zu Stripe. `redirect` wirft — alles danach liefe nicht mehr.
  redirect(result.url);
}

"use client";

import { useEffect, useState } from "react";
import type { ResolvedTheme } from "@/lib/themes";

/**
 * Der Streifen nach der Rückkehr von Stripe.
 *
 * Keine eigene Danke-Seite: der Besucher wollte auf diese Bio-Seite, nicht auf
 * eine Quittung. Er landet also wieder hier, mit einer Zeile darüber, die nach
 * ein paar Sekunden geht.
 *
 * Die Farben kommen als Inline-Werte, nicht aus den Theme-Variablen: dieser
 * Streifen liegt außerhalb von `ProfilePage`, und dort sind die Variablen nicht
 * gesetzt. Zwei Werte von Hand sind hier billiger als eine zweite Stelle, die
 * das Theme aufspannt.
 *
 * Auch die Adresse wird aufgeräumt. Bliebe `?danke=1` stehen, hieße jedes
 * Neuladen und jeder geteilte Link wieder „Danke" — für jemanden, der nichts
 * gegeben hat.
 */
export function TipNotice({
  kind,
  theme,
  text,
}: {
  kind: "danke" | "abgebrochen";
  theme: Pick<ResolvedTheme, "accent" | "accentFg" | "surface" | "fg" | "border">;
  text: string;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("danke");
    url.searchParams.delete("abgebrochen");
    window.history.replaceState(null, "", url.toString());

    const timer = window.setTimeout(() => setVisible(false), 6000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const thanks = kind === "danke";

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3"
      style={{ pointerEvents: "none" }}
    >
      <p
        className="max-w-md rounded-full px-4 py-2 text-center text-sm font-medium shadow-lg shadow-black/20"
        style={
          thanks
            ? { background: theme.accent, color: theme.accentFg }
            : { background: theme.surface, color: theme.fg, border: `1px solid ${theme.border}` }
        }
      >
        {text}
      </p>
    </div>
  );
}

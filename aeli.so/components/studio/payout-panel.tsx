"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  connectPayoutAction,
  disconnectPayoutAction,
  payoutDashboardAction,
} from "@/app/actions/payouts";
import { EMPTY_STATE } from "@/lib/action-state";
import { Button } from "@/components/ui/button";

/**
 * Zahlungen.
 *
 * Der Abschnitt beantwortet genau eine Frage — „wohin geht das Geld?" — und
 * hat deshalb genau vier mögliche Zustände. Sie schließen sich gegenseitig
 * aus, und jeder sagt, was als Nächstes zu tun ist:
 *
 *   aera        Läuft über die eigene Aera-Community. Nichts zu tun.
 *   aeli-fertig Eigenes Stripe-Konto, bereit.
 *   aeli-offen  Konto angelegt, Einrichtung nicht zu Ende gebracht.
 *   keins       Noch nichts verbunden.
 *
 * Der Fall, der sonst wie ein Fehler aussähe, steht ausdrücklich da: eine
 * verknüpfte Community, die jemand anderem gehört, gibt ihr Stripe-Konto NICHT
 * her. Ohne diesen Satz sucht der Creator den Fehler bei sich.
 */

export interface PayoutView {
  /** Woher das Konto kommt, das gerade gelten würde. */
  source: "aeli" | "aera" | null;
  /** Nur bei `aera`: der Name der Community. */
  communityName: string | null;
  /** Hat der Creator in Aeli selbst ein Konto angelegt? */
  hasOwnAccount: boolean;
  /** Ist dieses eigene Konto bei Stripe fertig eingerichtet? */
  ownAccountReady: boolean;
  /** Eine verknüpfte Community, die kein Konto beisteuert — und warum. */
  linkedCommunity: { name: string; ownedByYou: boolean; hasStripe: boolean } | null;
  /** Ohne Stripe-Schlüssel in der Umgebung geht hier gar nichts. */
  configured: boolean;
}

export function PayoutPanel({ view }: { view: PayoutView }) {
  const [state, disconnect] = useActionState(disconnectPayoutAction, EMPTY_STATE);

  if (!view.configured) {
    return (
      <p className="rounded-lg border border-line bg-ink px-3 py-2.5 text-sm text-ash">
        Zahlungen sind auf diesem Server nicht eingerichtet. Der Trinkgeld-Baustein bleibt ein
        gewöhnlicher Link.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {view.source === "aera" && (
        <Status tone="ok" title={`Läuft über „${view.communityName}"`}>
          Trinkgelder gehen auf das Stripe-Konto deiner Aera-Community. Du musst hier nichts
          einrichten — es ist dasselbe Konto, dieselben Auszahlungen.
        </Status>
      )}

      {view.source === "aeli" && view.ownAccountReady && (
        <Status tone="ok" title="Eigenes Stripe-Konto verbunden">
          Trinkgelder gehen direkt an dich. Auszahlungen und Belege verwaltest du bei Stripe.
        </Status>
      )}

      {view.source === "aeli" && !view.ownAccountReady && (
        <Status tone="warn" title="Einrichtung nicht abgeschlossen">
          Stripe braucht noch Angaben von dir — meist einen Ausweis und eine Bankverbindung.
          Solange das fehlt, nimmt der Trinkgeld-Baustein kein Geld an.
        </Status>
      )}

      {view.source === null && !view.hasOwnAccount && (
        <Status tone="plain" title="Noch kein Konto verbunden">
          Der Trinkgeld-Baustein zeigt bis dahin nur den Link, den du bei ihm hinterlegt hast.
        </Status>
      )}

      {/* Der Satz, der einen Nicht-Fehler als Nicht-Fehler kennzeichnet. */}
      {view.linkedCommunity && view.source !== "aera" && (
        <p className="text-xs leading-relaxed text-ash">
          {view.linkedCommunity.ownedByYou
            ? view.linkedCommunity.hasStripe
              ? `„${view.linkedCommunity.name}" hat ein Stripe-Konto — es wird benutzt, sobald du hier keins eigenes verbunden hast.`
              : `„${view.linkedCommunity.name}" gehört dir, hat aber noch kein Stripe-Konto. Sobald du es in Aera einrichtest, kannst du es hier mitbenutzen.`
            : `Diese Seite zeigt auf „${view.linkedCommunity.name}" — eine Community, die einem anderen Konto gehört. Ihr Stripe-Konto wird deshalb nicht verwendet.`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {view.source !== "aera" && (
          <form action={connectPayoutAction}>
            <Submit
              label={
                view.hasOwnAccount
                  ? view.ownAccountReady
                    ? "Bei Stripe verwalten"
                    : "Einrichtung fortsetzen"
                  : "Stripe-Konto verbinden"
              }
            />
          </form>
        )}

        {view.hasOwnAccount && view.ownAccountReady && (
          <form action={payoutDashboardAction}>
            <Submit label="Stripe-Dashboard" tone="ghost" />
          </form>
        )}

        {view.hasOwnAccount && (
          <form action={disconnect}>
            <Submit label="Trennen" tone="ghost" />
          </form>
        )}
      </div>

      {(state.notice || state.error) && (
        <p className={`text-xs ${state.error ? "text-ember" : "text-signal"}`} role="status">
          {state.error ?? state.notice}
        </p>
      )}
    </div>
  );
}

function Status({
  tone,
  title,
  children,
}: {
  tone: "ok" | "warn" | "plain";
  title: string;
  children: React.ReactNode;
}) {
  const border =
    tone === "ok" ? "border-signal/40" : tone === "warn" ? "border-ember/40" : "border-line";
  const dot = tone === "ok" ? "bg-signal" : tone === "warn" ? "bg-ember" : "bg-ash";
  return (
    <div className={`rounded-lg border bg-ink px-3 py-2.5 ${border}`}>
      <p className="flex items-center gap-2 text-sm font-medium text-chalk">
        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${dot}`} />
        {title}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ash">{children}</p>
    </div>
  );
}

function Submit({ label, tone }: { label: string; tone?: "ghost" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" tone={tone} disabled={pending}>
      {pending ? "…" : label}
    </Button>
  );
}

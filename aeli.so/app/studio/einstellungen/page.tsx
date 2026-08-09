import type { Metadata } from "next";
import { requireProfile } from "@/lib/profile";
import { getCurrentUser } from "@/lib/auth";
import { systemPrisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { profileUrlLabelParts } from "@/lib/url";
import { paymentsConfigured } from "@/lib/env";
import { linkedCommunityPayout, ownPayoutAccountId, resolvePayoutAccount } from "@/lib/payouts";
import { canReceive, getConnectStatus } from "@/lib/stripe";
import { PayoutPanel, type PayoutView } from "@/components/studio/payout-panel";
import {
  CommunityForm,
  GateForm,
  HandleForm,
  OptionsForm,
  SeoForm,
} from "@/components/studio/settings-forms";

export const metadata: Metadata = { title: "Einstellungen", robots: { index: false } };

export default async function SettingsPage() {
  const profile = await requireProfile();
  const user = (await getCurrentUser())!;

  // Welche Communities gehören diesem Konto? Die Besitzfrage steht in
  // `Tenant.ownerId`, und darauf hat die Rolle `aeli_app` keinen Blick (ihre
  // Policy kennt nur „aktiv“). Deshalb hier ein enger, privilegierter Griff:
  // gefiltert auf genau diesen Nutzer, ausgelesen werden Name und ID.
  const tenants = await systemPrisma.tenant.findMany({
    where: { ownerId: user.id, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Nicht selbst zusammengebaut: dieselbe Adresse, die die Kopfzeile, der
  // QR-Code und der Teilen-Knopf zeigen. Begruendung in lib/url.ts.
  const url = profileUrlLabelParts();

  // Drei Fragen, eine Antwort: welches Konto gilt gerade, gibt es ein eigenes,
  // und was steuert die verknuepfte Community bei. Die Statusabfrage bei
  // Stripe kostet einen Netzwerkaufruf — sie laeuft deshalb nur, wenn es
  // ueberhaupt ein eigenes Konto gibt.
  const owner = { userId: user.id, linkedTenantId: profile.linkedTenantId };
  const [active, ownAccountId, linkedCommunity] = await Promise.all([
    resolvePayoutAccount(owner),
    ownPayoutAccountId(user.id),
    linkedCommunityPayout(owner),
  ]);
  const ownAccountReady = ownAccountId ? canReceive(await getConnectStatus(ownAccountId)) : false;

  const payout: PayoutView = {
    source: active?.source ?? null,
    communityName: active?.communityName ?? null,
    hasOwnAccount: Boolean(ownAccountId),
    ownAccountReady,
    linkedCommunity,
    configured: paymentsConfigured(),
  };

  return (
    <div className="max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="mt-1 text-sm text-ash">Adresse, Auffindbarkeit, Zugang.</p>
      </header>

      <Section title="Adresse">
        <HandleForm handle={profile.handle} url={url} />
      </Section>

      <Section title="Auffindbarkeit" hint="Was in Suchergebnissen und geteilten Links steht.">
        <SeoForm
          seoTitle={profile.seoTitle ?? ""}
          seoDescription={profile.seoDescription ?? ""}
          seoImageUrl={profile.seoImageUrl ?? ""}
          seoNoindex={profile.seoNoindex}
          fallbackTitle={profile.displayName}
        />
      </Section>

      <Section
        title="Zahlungen"
        hint="Wohin Trinkgelder gehen. Betrifft nur den Baustein „Trinkgeld“."
      >
        <PayoutPanel view={payout} />
      </Section>

      <Section title="Verhalten">
        <OptionsForm smartSort={profile.smartSort} showBranding={profile.showBranding} />
      </Section>

      <Section title="Zugang" hint="Wer die Seite sehen darf, bevor er sie sieht.">
        <GateForm gate={profile.gate} hasPassword={Boolean(profile.gatePasswordHash)} />
      </Section>

      <Section
        title="Community"
        hint="Die Brücke nach Aera: aus einem Klick auf deiner Seite wird eine Mitgliedschaft."
      >
        <CommunityForm
          tenants={tenants}
          linkedTenantId={profile.linkedTenantId}
          // Der Name kommt aus der Verknüpfung selbst, nicht aus der Liste
          // darüber: eine über Verbindungscode verknüpfte Community gehört
          // einem anderen Konto und taucht dort gar nicht auf.
          linkedTenantName={profile.linkedTenant?.name ?? null}
        />
      </Section>

      <Section title="Konto">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ash">E-Mail</dt>
            <dd className="truncate text-chalk">{user.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ash">Name</dt>
            <dd className="truncate text-chalk">{user.name}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-ash">
          Dein Konto gilt für Aeli und Aera gemeinsam. Passwort, Zwei-Faktor und Kontolöschung
          verwaltest du in den Kontoeinstellungen auf{" "}
          <a
            href={env.AERA_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-chalk underline underline-offset-4"
          >
            aera.so
          </a>
          .
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-ink-2 p-5">
      <h2 className="text-base font-semibold text-chalk">{title}</h2>
      {hint && <p className="mt-1 text-sm text-ash">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

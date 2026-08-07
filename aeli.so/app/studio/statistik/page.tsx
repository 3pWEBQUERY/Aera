import type { Metadata } from "next";
import { requireProfile } from "@/lib/profile";
import { getCurrentUser } from "@/lib/auth";
import { analyticsSummary } from "@/lib/analytics";
import { blockDescriptor } from "@/lib/blocks";
import { CHART } from "@/lib/chart-palette";
import { TimeseriesChart } from "@/components/studio/timeseries-chart";
import type { AeliBlockType, AeliDevice } from "@/app/generated/prisma/client";

export const metadata: Metadata = { title: "Statistik", robots: { index: false } };

/**
 * Die Statistik beantwortet drei Fragen und keine vierte:
 * kommen Leute? klicken sie? und worauf?
 *
 * Was hier bewusst fehlt: Verweildauer, Wiederkehrer über Tage hinweg,
 * Herkunftsländer auf Stadtebene. Nicht weil es schwer wäre — sondern weil die
 * Daten dafür nie erhoben werden (siehe lib/analytics.ts). Eine Bio-Seite
 * braucht kein Einwilligungsbanner, und das ist der Preis dafür.
 */
export default async function AnalyticsPage() {
  const profile = await requireProfile();
  const user = (await getCurrentUser())!;
  const stats = await analyticsSummary(profile.id, user.id, 30);

  const nothingYet = stats.views === 0 && stats.clicks === 0;

  return (
    <div className="max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Statistik</h1>
        <p className="mt-1 text-sm text-ash">Letzte 30 Tage. Ohne Cookies, ohne IP-Adressen.</p>
      </header>

      {nothingYet ? (
        <p className="rounded-2xl border border-dashed border-line px-6 py-14 text-center text-sm text-ash">
          {profile.status === "PUBLISHED"
            ? "Noch keine Aufrufe. Teil den Link — die Zahlen kommen von selbst."
            : "Die Seite ist noch nicht veröffentlicht, also kann sie auch noch niemand aufrufen."}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Aufrufe" value={stats.views} />
            <Stat label="Besucher" value={stats.visitors} hint="verschiedene Geräte pro Tag" />
            <Stat label="Klicks" value={stats.clicks} />
            <Stat
              label="Klickrate"
              value={`${stats.clickRate.toLocaleString("de-DE")} %`}
              hint="Klicks je 100 Aufrufe"
            />
          </div>

          <section className="rounded-2xl border border-line bg-ink-2 p-5">
            <h2 className="mb-4 text-base font-semibold text-chalk">Verlauf</h2>
            <TimeseriesChart series={stats.series} />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-line bg-ink-2 p-5">
              <h2 className="mb-1 text-base font-semibold text-chalk">Meistgeklickt</h2>
              <p className="mb-4 text-sm text-ash">
                Was oben steht, gehört meistens auch nach oben auf die Seite.
              </p>
              <RankedList
                items={stats.topBlocks.map((block) => ({
                  key: block.blockId,
                  label: block.title,
                  meta: blockDescriptor(block.type as AeliBlockType).label,
                  value: block.clicks,
                }))}
                color={CHART.clicks}
                emptyText="Noch kein Klick."
              />
            </section>

            <section className="rounded-2xl border border-line bg-ink-2 p-5">
              <h2 className="mb-1 text-base font-semibold text-chalk">Woher sie kommen</h2>
              <p className="mb-4 text-sm text-ash">
                Nur der Host der Herkunft — Pfade speichern wir nicht.
              </p>
              <RankedList
                items={stats.referrers.map((entry) => ({
                  key: entry.host,
                  label: entry.host,
                  value: entry.count,
                }))}
                color={CHART.views}
                emptyText="Noch nichts zu sehen."
              />
            </section>
          </div>

          <section className="rounded-2xl border border-line bg-ink-2 p-5">
            <h2 className="mb-1 text-base font-semibold text-chalk">Geräte</h2>
            <p className="mb-4 text-sm text-ash">
              Deine Seite wird auf dem gelesen, was hier vorn steht.
            </p>
            <DeviceSplit devices={stats.devices} />
          </section>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-ink-2 p-5">
      <p className="text-xs tracking-wide text-ash uppercase">{label}</p>
      {/* Die Zahl ist die Aussage — sie bekommt die Größe, nicht die
          Beschriftung darüber. */}
      <p className="mt-2 text-3xl font-semibold tracking-tight text-chalk">
        {typeof value === "number" ? value.toLocaleString("de-DE") : value}
      </p>
      {hint && <p className="mt-1 text-xs text-ash">{hint}</p>}
    </div>
  );
}

/**
 * Rangliste mit Balken im Hintergrund.
 *
 * Der Balken sitzt hinter dem Text statt daneben: so bleibt der volle Platz für
 * Titel, die lang sind, und die Länge ist trotzdem auf einen Blick vergleichbar.
 * Alle Balken tragen dieselbe Farbe — sie zeigen dieselbe Größe, nicht
 * verschiedene Kategorien.
 */
function RankedList({
  items,
  color,
  emptyText,
}: {
  items: { key: string; label: string; meta?: string; value: number }[];
  color: string;
  emptyText: string;
}) {
  if (items.length === 0) return <p className="text-sm text-ash">{emptyText}</p>;
  const max = Math.max(...items.map((item) => item.value));

  return (
    <ol className="space-y-1.5">
      {items.map((item) => (
        <li key={item.key} className="relative overflow-hidden rounded-lg">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-lg"
            style={{ width: `${(item.value / max) * 100}%`, background: color, opacity: 0.22 }}
          />
          <span className="relative flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-chalk">{item.label}</span>
              {item.meta && <span className="block text-xs text-ash">{item.meta}</span>}
            </span>
            <span className="shrink-0 text-sm font-semibold text-chalk">
              {item.value.toLocaleString("de-DE")}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

const DEVICE_LABEL: Record<AeliDevice, string> = {
  MOBILE: "Handy",
  TABLET: "Tablet",
  DESKTOP: "Rechner",
  UNKNOWN: "Unbekannt",
};

/**
 * Drei Kategorien in einem Balken. Die 2-Pixel-Lücken zwischen den Segmenten
 * sind kein Dekor: ohne sie verschmelzen zwei benachbarte Farben für jemanden
 * mit Rot-Grün-Sehschwäche zu einer Fläche.
 */
function DeviceSplit({ devices }: { devices: { device: AeliDevice; count: number }[] }) {
  const total = devices.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) return <p className="text-sm text-ash">Noch nichts zu sehen.</p>;

  const colors: Record<AeliDevice, string> = {
    MOBILE: CHART.views,
    DESKTOP: CHART.clicks,
    TABLET: CHART.third,
    UNKNOWN: CHART.grid,
  };

  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {devices.map((entry) => (
          <span
            key={entry.device}
            aria-hidden
            style={{ width: `${(entry.count / total) * 100}%`, background: colors[entry.device] }}
          />
        ))}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        {devices.map((entry) => (
          <li key={entry.device} className="flex items-baseline gap-2 text-sm">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: colors[entry.device] }}
            />
            <span className="text-ash">{DEVICE_LABEL[entry.device]}</span>
            <span className="font-semibold text-chalk">
              {Math.round((entry.count / total) * 100)} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

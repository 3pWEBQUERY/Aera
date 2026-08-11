import type { Metadata } from "next";
import { profileAeraContent, profileTipsEnabled, requireProfile } from "@/lib/profile";
import { studioPageData } from "@/lib/page-data";
import { parseBlockConfig } from "@/lib/blocks";
import { CardBar } from "@/components/studio/card-bar";
import { toggleCardAction } from "@/app/actions/cards";
import { Button } from "@/components/ui/button";
import { BlockList } from "@/components/studio/block-list";
import { AddBlock } from "@/components/studio/add-block";
import { PhonePreview } from "@/components/studio/phone-preview";
import type { StudioBlock } from "@/components/studio/types";

export const metadata: Metadata = { title: "Seite", robots: { index: false } };

/**
 * Die Arbeitsfläche: links die Bausteine, rechts die Seite.
 *
 * Die Vorschau zeigt nur die sichtbaren Blöcke — sie beantwortet die Frage
 * „was sehen andere“, nicht „was habe ich alles angelegt“. Die zweite Frage
 * beantwortet die Liste daneben, inklusive der versteckten und geplanten.
 */
export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ karte?: string }>;
}) {
  const profile = await requireProfile();
  // Welche Karte bearbeitet wird, steht in der Adresse und nicht in einem
  // Zustand — so überlebt die Auswahl das Speichern und den Zurück-Knopf.
  const wished = (await searchParams).karte;
  const card = profile.cards.find((entry) => entry.slug === wished) ?? profile.cards[0]!;
  // Das Studio ist deutsch (lib/i18n.ts) — die Vorschau zeigt Termine so,
  // wie sie ein deutschsprachiger Besucher saehe.
  const [aera, tipsEnabled] = await Promise.all([
    profileAeraContent(profile, "de"),
    profileTipsEnabled(profile),
  ]);

  const blocks: StudioBlock[] = card.blocks.map((block) => ({
    id: block.id,
    type: block.type,
    title: block.title,
    subtitle: block.subtitle,
    href: block.href,
    mediaUrl: block.mediaUrl,
    icon: block.icon,
    config: parseBlockConfig(block.config),
    isVisible: block.isVisible,
    startsAt: block.startsAt?.toISOString() ?? null,
    endsAt: block.endsAt?.toISOString() ?? null,
    clickCount: block.clickCount,
  }));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] xl:gap-12">
      <div className="space-y-4">
        <CardBar
          cards={profile.cards.map((entry) => ({
            id: entry.id,
            slug: entry.slug,
            title: entry.title,
            icon: entry.icon,
            isVisible: entry.isVisible,
            blockCount: entry.blocks.length,
          }))}
          activeId={card.id}
          basePath="/studio"
        />

        {!card.isVisible && (
          // Verstecken ist eine gültige Entscheidung — aber eine, die man
          // vergisst. Bis hier ein Satz stand, war der einzige Hinweis ein
          // grauer Punkt im Reiter, und wer seine Karte auf der Seite suchte,
          // fand sie nicht und wusste nicht, warum.
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ember/40 bg-ember/10 px-4 py-3">
            <p className="min-w-0 flex-1 text-sm text-chalk">
              Diese Karte ist versteckt — auf deiner Seite fehlt sie.
            </p>
            <form action={toggleCardAction}>
              <input type="hidden" name="id" value={card.id} />
              <Button type="submit" size="sm">
                Sichtbar machen
              </Button>
            </form>
          </div>
        )}

        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{card.title}</h1>
          <p className="text-sm text-ash">
            {blocks.length} {blocks.length === 1 ? "Baustein" : "Bausteine"} · am Griff ziehen zum
            Sortieren
          </p>
        </header>

        {blocks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-sm text-ash">
            Noch nichts drauf. Fang mit einem Link an — alles andere kommt von selbst dazu.
          </p>
        ) : (
          <BlockList cardId={card.id} blocks={blocks} tipsEnabled={tipsEnabled} />
        )}

        <AddBlock cardId={card.id} hasCommunity={Boolean(profile.linkedTenantId)} />
      </div>

      {/* Die Vorschau bleibt beim Scrollen stehen: sie ist der Grund, warum man
          links etwas ändert, und wandert sonst genau dann aus dem Bild, wenn
          die Liste lang wird. */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <PhonePreview
          page={studioPageData(profile, { onlyVisible: true, aera, tipsEnabled, onlyCardId: card.id })}
          label="So sieht sie auf dem Handy aus"
        />
      </aside>
    </div>
  );
}

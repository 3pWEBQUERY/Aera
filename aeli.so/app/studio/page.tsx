import type { Metadata } from "next";
import { requireProfile } from "@/lib/profile";
import { studioPageData } from "@/lib/page-data";
import { parseBlockConfig } from "@/lib/blocks";
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
export default async function StudioPage() {
  const profile = await requireProfile();

  const blocks: StudioBlock[] = profile.blocks.map((block) => ({
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
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Deine Seite</h1>
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
          <BlockList blocks={blocks} />
        )}

        <AddBlock hasCommunity={Boolean(profile.linkedTenantId)} />
      </div>

      {/* Die Vorschau bleibt beim Scrollen stehen: sie ist der Grund, warum man
          links etwas ändert, und wandert sonst genau dann aus dem Bild, wenn
          die Liste lang wird. */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <PhonePreview
          page={studioPageData(profile, { onlyVisible: true })}
          label="So sieht sie auf dem Handy aus"
        />
      </aside>
    </div>
  );
}

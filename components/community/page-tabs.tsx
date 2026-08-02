import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { PageNavEntry } from "@/lib/community-pages";

/**
 * Reiterleiste unter dem Kopfbereich einer Community.
 *
 * "Startseite" steht immer links und ist nicht verschiebbar: sie zeigt, was der
 * Creator im Layout-Editor gebaut hat, und ist der Ort, an den ein Besucher
 * zurueckfindet. Alles rechts davon sind frei gebaute Seiten in der
 * Reihenfolge, die der Creator gesetzt hat.
 *
 * Ohne eigene Seiten zeichnet die Leiste nichts — ein einzelner Reiter
 * "Startseite" waere eine Navigation, die nirgendwohin fuehrt.
 */
export async function CommunityPageTabs({
  slug,
  pages,
  /** Adressteil der offenen Seite; fehlt auf der Startseite. */
  activeSlug,
}: {
  slug: string;
  pages: PageNavEntry[];
  activeSlug?: string;
}) {
  if (pages.length === 0) return null;
  const t = await getTranslations("community.pages");

  const tabs = [
    { href: `/c/${slug}`, label: t("home"), active: !activeSlug },
    ...pages.map((p) => ({
      href: `/c/${slug}/p/${p.slug}`,
      label: p.title,
      active: p.slug === activeSlug,
    })),
  ];

  return (
    <nav aria-label={t("navAria")} className="border-b border-[#161613]/10">
      {/*
       * Zentriert, solange die Reiter passen, und ab da scrollbar. Ein
       * `justify-center` allein liesse die ersten Reiter bei vielen Seiten auf
       * schmalen Geraeten nach links aus dem Bild wandern — mit `mx-auto` auf
       * der Liste bleibt der Anfang erreichbar.
       */}
      <div className="scrollbar-none mx-auto flex max-w-7xl overflow-x-auto px-4 sm:px-6">
        <ul className="mx-auto flex shrink-0 items-center gap-1">
          {tabs.map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={tab.active ? "page" : undefined}
                className={`relative block whitespace-nowrap px-4 py-3.5 text-sm font-semibold transition-colors ${
                  tab.active
                    ? "text-[color:var(--brand)]"
                    : "text-[#161613]/55 hover:text-[#161613]"
                }`}
              >
                {tab.label}
                {tab.active && (
                  <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--brand)]" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

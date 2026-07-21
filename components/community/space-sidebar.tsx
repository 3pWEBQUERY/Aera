import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import { Icon } from "@/components/dashboard/icons";
import { ButtonLink } from "@/components/ui/button";
import { excerpt, formatPrice, timeAgo } from "@/lib/utils";

/**
 * Right-hand sidebar for content spaces (feed, forum): post search,
 * membership upsell, popular products and popular posts. Sections hide
 * themselves when there is nothing to show.
 */
export async function SpaceSidebar({
  tenantId,
  tenantName,
  slug,
  spaceSlug,
  spaceId,
  isMember,
  query,
  hideSearch,
}: {
  tenantId: string;
  tenantName: string;
  slug: string;
  spaceSlug: string;
  spaceId: string;
  isMember: boolean;
  query: string;
  hideSearch?: boolean;
}) {
  const [popularRaw, products, shopSpace] = await Promise.all([
    prisma.post.findMany({
      where: { tenantId, spaceId, isPublished: true },
      orderBy: { reactions: { _count: "desc" } },
      take: 5,
      include: { _count: { select: { reactions: true, comments: true } } },
    }),
    prisma.product.findMany({
      where: { tenantId, isPublished: true },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        coverUrl: true,
        priceCents: true,
        currency: true,
      },
    }),
    prisma.space.findFirst({
      where: { tenantId, type: "SHOP", isArchived: false },
      select: { slug: true },
    }),
  ]);
  const popularPosts = popularRaw.filter((p) => p._count.reactions > 0);
  const t = await getTranslations("community.render.sidebar");
  const locale = await getLocale();

  return (
    <aside className="space-y-5 lg:sticky lg:top-20">
      {/* Post search */}
      {!hideSearch && (
        <form method="GET">
          <div className="flex items-center gap-2 rounded-full border border-[#161613]/10 bg-white px-3.5 py-2.5 transition focus-within:border-[var(--brand)] focus-within:ring-2 focus-within:ring-[var(--brand-ring)]">
            <Icon name="search" size={16} className="shrink-0 text-[#161613]/50" />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder={t("searchPosts")}
              aria-label={t("searchPosts")}
              className="w-full bg-transparent text-sm outline-none placeholder:text-[#161613]/50"
            />
          </div>
        </form>
      )}

      {/* Membership upsell */}
      {!isMember && (
        <div className="bg-[var(--brand)] overflow-hidden rounded-2xl p-5 text-white">
          <p className="font-semibold">{t("upsellTitle", { name: tenantName })}</p>
          <p className="mt-1 text-sm text-white/85">
            {t("upsellDesc")}
          </p>
          <ButtonLink
            href={`/c/${slug}/join`}
            size="sm"
            variant="secondary"
            className="mt-4 rounded-full border-0"
          >
            {t("joinNow")}
          </ButtonLink>
        </div>
      )}

      {/* Popular products */}
      {products.length > 0 && (
        <section className="rounded-2xl border border-[#161613]/10 bg-white p-4">
          <h2 className="display-serif text-lg text-[#161613]">{t("popularProducts")}</h2>
          <ul className="mt-3 space-y-3">
            {products.map((prod) => (
              <li key={prod.id}>
                <Link
                  href={shopSpace ? `/c/${slug}/s/${shopSpace.slug}` : `/c/${slug}`}
                  className="group flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                >
                  {prod.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={prod.coverUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg border border-[#161613]/10 object-cover"
                    />
                  ) : (
                    <span className="bg-[var(--brand)] flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-white">
                      <Icon name="products" size={18} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[#161613] group-hover:text-[color:var(--brand)]">
                      {prod.name}
                    </span>
                    <span className="block text-sm font-semibold text-[#161613]/60">
                      {formatPrice(prod.priceCents, prod.currency, locale)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {shopSpace && (
            <Link
              href={`/c/${slug}/s/${shopSpace.slug}`}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--brand)] hover:underline"
            >
              {t("toShop")}
              <Icon name="chevron" size={14} className="-rotate-90" />
            </Link>
          )}
        </section>
      )}

      {/* Popular posts */}
      {popularPosts.length > 0 && (
        <section className="rounded-2xl border border-[#161613]/10 bg-white p-4">
          <h2 className="display-serif text-lg text-[#161613]">{t("popularPosts")}</h2>
          <ul className="mt-3 space-y-3">
            {popularPosts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/c/${slug}/s/${spaceSlug}/${p.id}`}
                  className="group flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                >
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg border border-[#161613]/10 object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
                      <Icon name="feed" size={18} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm font-medium leading-snug text-[#161613] group-hover:text-[color:var(--brand)]">
                      {p.title || excerpt(p.body, 60)}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-[#161613]/50">
                      {timeAgo(p.createdAt, locale)}
                      <span className="inline-flex items-center gap-1">
                        <Icon name="heart" size={11} /> {p._count.reactions}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

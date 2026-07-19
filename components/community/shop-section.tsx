import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { purchaseProductAction } from "@/app/actions/engage";
import { PurchaseSubmitButton } from "@/components/community/purchase-submit-button";
import { ImmediateAccessConsent } from "@/components/community/immediate-access-consent";
import { Button, ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { ProductCarousel } from "@/components/community/product-carousel";
import { formatPrice } from "@/lib/utils";

type T = Awaited<ReturnType<typeof getTranslations>>;

const PRODUCT_TYPES = ["DIGITAL", "PHYSICAL", "BUNDLE", "COURSE_ACCESS", "TIER_GRANT"];
const productTypeKey = (type: string) => (PRODUCT_TYPES.includes(type) ? type : "DIGITAL");

/** Gallery images with a cover-only fallback for legacy products. */
function gallery(p: { images: string[]; coverUrl: string | null }): string[] {
  if (p.images.length > 0) return p.images;
  return p.coverUrl ? [p.coverUrl] : [];
}

export interface ShopProduct {
  id: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  images: string[];
  priceCents: number;
  type: string;
  requiresShipping: boolean;
  freeShipping: boolean;
  shippingCents: number;
  stock: number | null;
  downloadUrl: string | null;
}

export type ShopNotice =
  | { kind: "purchased"; name: string | null }
  | { kind: "soldout"; name: string | null }
  | { kind: "error"; message: string }
  | null;

function NoticeBanner({ slug, notice, t }: { slug: string; notice: NonNullable<ShopNotice>; t: T }) {
  if (notice.kind === "purchased") {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <Icon name="check" size={18} className="mt-0.5 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium text-emerald-900">
            {t("purchasedTitle", { name: notice.name ? ` — ${notice.name}` : "" })}
          </p>
          <p className="text-emerald-700">
            {t("purchasedConfirmed")}{" "}
            <Link href={`/c/${slug}/library`} className="font-medium underline underline-offset-2">
              {t("toLibrary")}
            </Link>
          </p>
        </div>
      </div>
    );
  }
  if (notice.kind === "soldout") {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-sm text-amber-800">
          {notice.name ? t("soldoutNamed", { name: notice.name }) : t("soldoutGeneric")}
        </p>
      </div>
    );
  }
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
      <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-red-600" />
      <p className="text-sm text-red-800">{notice.message}</p>
    </div>
  );
}

export async function ShopSection({
  slug,
  products,
  ownedIds,
  shopHref,
  notice,
}: {
  slug: string;
  products: ShopProduct[];
  ownedIds: string[];
  shopHref?: string | null;
  notice?: ShopNotice;
}) {
  if (products.length === 0 && !notice) return null;
  const owned = new Set(ownedIds);
  const t = await getTranslations("community.render.shop");
  const tType = await getTranslations("community.render.productTypes");
  const locale = await getLocale();

  return (
    <section aria-labelledby="shop-heading">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 id="shop-heading" className="display-serif text-2xl text-[#161613]">
          {t("heading")}
        </h2>
        {shopHref && (
          <Link
            href={shopHref}
            className="inline-flex items-center gap-1 text-sm font-semibold text-[#161613]/70 transition-colors hover:gap-1.5 hover:text-[#161613]"
          >
            {t("viewAll")}
            <Icon name="arrowRight" size={15} />
          </Link>
        )}
      </div>

      {notice && <NoticeBanner slug={slug} notice={notice} t={t} />}

      {products.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const isOwned = owned.has(p.id);
            const soldOut = p.stock !== null && p.stock <= 0;
            const isFree = p.priceCents === 0;
            const lowStock = p.stock !== null && p.stock > 0 && p.stock <= 5;
            return (
              <div
                key={p.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-[#161613]/10 bg-white transition duration-300 hover:-translate-y-1 hover:border-[#161613]/25"
              >
                <div
                  className="relative w-full overflow-hidden bg-[#161613]/5"
                  style={{ aspectRatio: "4 / 3" }}
                >
                  {gallery(p).length > 0 ? (
                    <ProductCarousel images={gallery(p)} alt={p.name} />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-[#161613]/25">
                      <Icon name="products" size={30} />
                    </div>
                  )}
                  <span className="absolute left-2.5 top-2.5">
                    <Pill className="bg-white/85 text-slate-700 shadow-sm backdrop-blur">
                      {tType(productTypeKey(p.type))}
                    </Pill>
                  </span>
                  {isOwned ? (
                    <span className="absolute right-2.5 top-2.5">
                      <Pill className="bg-emerald-500/90 text-white shadow-sm backdrop-blur">
                        {t("owned")}
                      </Pill>
                    </span>
                  ) : soldOut ? (
                    <span className="absolute right-2.5 top-2.5">
                      <Pill className="bg-slate-900/70 text-white shadow-sm backdrop-blur">
                        {t("soldOut")}
                      </Pill>
                    </span>
                  ) : lowStock ? (
                    <span className="absolute right-2.5 top-2.5">
                      <Pill className="bg-amber-500/90 text-white shadow-sm backdrop-blur">
                        {t("lowStock", { count: p.stock! })}
                      </Pill>
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <h3 className="display-serif text-lg text-[#161613]">{p.name}</h3>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 flex-1 text-sm text-[#161613]/60">
                      {p.description}
                    </p>
                  )}
                  {p.requiresShipping && (
                    <p className="mt-2 text-xs text-[#161613]/50">
                      {p.freeShipping
                        ? t("freeShipping")
                        : t("shippingCost", { price: formatPrice(p.shippingCents, "eur", locale) })}
                    </p>
                  )}

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="display-serif text-xl text-[#161613]">
                      {isFree ? t("free") : formatPrice(p.priceCents, "eur", locale)}
                    </span>
                    {isOwned ? (
                      p.downloadUrl ? (
                        <ButtonLink href={p.downloadUrl} size="sm" variant="secondary">
                          {t("download")}
                        </ButtonLink>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600">
                          <Icon name="check" size={16} />
                          {t("owned")}
                        </span>
                      )
                    ) : soldOut ? (
                      <Pill className="bg-[#161613]/5 text-[#161613]/60">{t("soldOut")}</Pill>
                    ) : (
                      <form action={purchaseProductAction} className="max-w-56">
                        <input type="hidden" name="tenant" value={slug} />
                        <input type="hidden" name="productId" value={p.id} />
                        {!isFree && p.type !== "PHYSICAL" && (
                          <ImmediateAccessConsent className="mb-2" />
                        )}
                        <PurchaseSubmitButton>
                          {isFree ? t("get") : t("buy")}
                        </PurchaseSubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  createProductAction,
  updateProductAction,
  deleteProductAction,
  type ActionState,
} from "@/app/actions/dashboard";
import { Sheet } from "./sheet";
import { Icon, type IconName } from "./icons";
import { MultiImageUpload } from "./multi-image-upload";
import { Input, Label, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Pill, FormError } from "@/components/ui/misc";
import { cn, formatPrice } from "@/lib/utils";

export interface ProductRowData {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  type: string;
  downloadUrl: string | null;
  coverUrl: string | null;
  images: string[];
  isPublished: boolean;
  requiresShipping: boolean;
  freeShipping: boolean;
  shippingCents: number;
  stock: number | null;
  salesCount: number;
}

const TYPES: { value: string; icon: IconName }[] = [
  { value: "DIGITAL", icon: "export" },
  { value: "PHYSICAL", icon: "archive" },
  { value: "BUNDLE", icon: "products" },
  { value: "COURSE_ACCESS", icon: "courses" },
  { value: "TIER_GRANT", icon: "tiers" },
];
const typeIcon: Record<string, IconName> = Object.fromEntries(
  TYPES.map((ty) => [ty.value, ty.icon]),
) as Record<string, IconName>;

const initial: ActionState = {};

export function ProductsManager({
  slug,
  products,
  stripeReady,
}: {
  slug: string;
  products: ProductRowData[];
  stripeReady: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRowData | null>(null);
  const t = useTranslations("dashboard.products");
  const tTypes = useTranslations("dashboard.productTypes");
  const locale = useLocale();

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("subtitle", { count: products.length })}
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] sm:self-auto"
        >
          <Icon name="plus" size={18} />
          {t("create")}
        </button>
      </div>

      {!stripeReady && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t.rich("stripeWarning", { code: (c) => <code>{c}</code> })}
        </div>
      )}

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-16 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Icon name="products" size={24} />
          </span>
          <p className="mt-4 font-semibold text-slate-800">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("emptyText")}</p>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Icon name="plus" size={18} />
            {t("create")}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const icon = typeIcon[p.type] ?? ("products" as IconName);
            return (
              <button
                key={p.id}
                onClick={() => setEditing(p)}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-slate-300 hover:shadow-md"
              >
                <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden bg-slate-100">
                  {p.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.coverUrl} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <Icon name={icon} size={30} className="text-slate-300" />
                  )}
                  {p.images.length > 1 && (
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
                      <Icon name="gallery" size={12} />
                      {p.images.length}
                    </span>
                  )}
                  {!p.isPublished && (
                    <span className="absolute left-2 top-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-xs font-medium text-white">
                      {t("draft")}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{p.name}</p>
                    <Pill className="bg-slate-100 text-slate-500">{tTypes(`${p.type}.label`)}</Pill>
                  </div>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{p.description}</p>
                  )}
                  {p.requiresShipping && (
                    <p className="mt-1.5 text-xs text-slate-400">
                      {p.freeShipping
                        ? t("freeShipping")
                        : t("shippingCost", { amount: formatPrice(p.shippingCents, p.currency, locale) })}
                      {p.stock !== null
                        ? p.stock > 0
                          ? ` · ${t("inStock", { count: p.stock })}`
                          : ` · ${t("soldOut")}`
                        : ""}
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="font-semibold text-slate-900">{formatPrice(p.priceCents, p.currency, locale)}</span>
                    <span className="text-sm text-slate-400">
                      {t("salesCount", { count: p.salesCount })}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("createTitle")}
        subtitle={t("createSubtitle")}
        icon="products"
      >
        <ProductForm slug={slug} onDone={() => setCreateOpen(false)} />
      </Sheet>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t("editTitle")}
        subtitle={editing?.name}
        icon="products"
      >
        {editing && (
          <ProductForm
            key={editing.id}
            slug={slug}
            product={editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function ProductForm({
  slug,
  product,
  onDone,
}: {
  slug: string;
  product?: ProductRowData;
  onDone: () => void;
}) {
  const isEdit = !!product;
  const t = useTranslations("dashboard.products");
  const tTypes = useTranslations("dashboard.productTypes");
  const [state, action, pending] = useActionState(
    isEdit ? updateProductAction : createProductAction,
    initial,
  );
  const [type, setType] = useState(product?.type ?? "DIGITAL");
  const [price, setPrice] = useState(
    product && product.priceCents > 0 ? (product.priceCents / 100).toString() : "",
  );
  const [freeShipping, setFreeShipping] = useState(product?.freeShipping ?? false);
  const [shippingPrice, setShippingPrice] = useState(
    product && product.shippingCents > 0 ? (product.shippingCents / 100).toString() : "",
  );
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const cents = Math.max(0, Math.round(Number(price.replace(",", ".")) * 100) || 0);
  const shipCents = freeShipping
    ? 0
    : Math.max(0, Math.round(Number(shippingPrice.replace(",", ".")) * 100) || 0);

  async function onDelete() {
    if (!product) return;
    if (!confirm(t("confirmDelete", { name: product.name }))) return;
    setDeleting(true);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("productId", product.id);
    await deleteProductAction(fd);
    onDone();
  }

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="priceCents" value={cents} />
      <input type="hidden" name="freeShipping" value={freeShipping ? "true" : "false"} />
      <input type="hidden" name="shippingCents" value={shipCents} />
      {isEdit && <input type="hidden" name="productId" value={product!.id} />}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-7 px-6 py-10">
          <FormError message={state.error} />

          <div>
            <Label>{t("imagesLabel")}</Label>
            <MultiImageUpload
              tenant={slug}
              purpose="product-cover"
              defaultUrls={
                product
                  ? product.images.length > 0
                    ? product.images
                    : product.coverUrl
                      ? [product.coverUrl]
                      : []
                  : []
              }
            />
          </div>

          <div>
            <Label htmlFor="pf-name">{t("nameLabel")}</Label>
            <Input id="pf-name" name="name" required defaultValue={product?.name} placeholder={t("namePlaceholder")} className="text-base" />
          </div>

          <div>
            <p className="mb-3 text-sm font-medium text-slate-700">{t("typeLabel")}</p>
            <div className="grid grid-cols-2 gap-3">
              {TYPES.map((pt) => {
                const sel = pt.value === type;
                return (
                  <button
                    key={pt.value}
                    type="button"
                    onClick={() => setType(pt.value)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors duration-200",
                      sel
                        ? "border-black bg-slate-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition", sel ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600")}>
                      <Icon name={pt.icon} size={18} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">{tTypes(`${pt.value}.label`)}</span>
                      <span className="block text-xs text-slate-400">{tTypes(`${pt.value}.desc`)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label htmlFor="pf-price">{t("priceLabel")}</Label>
            <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-200">
              <span className="bg-slate-50 px-3 py-2 text-sm text-slate-500">€</span>
              <input
                id="pf-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="19.00"
                className="min-w-0 flex-1 px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>

          {type === "DIGITAL" && (
            <div>
              <Label htmlFor="pf-url">{t("downloadUrlLabel")}</Label>
              <Input id="pf-url" name="downloadUrl" type="url" defaultValue={product?.downloadUrl ?? ""} placeholder="https://…" />
            </div>
          )}

          {type === "PHYSICAL" && (
            <div className="space-y-4 rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">{t("shipping")}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { v: true, label: t("shipFreeLabel"), desc: t("shipFreeDesc") },
                  { v: false, label: t("shipPaidLabel"), desc: t("shipPaidDesc") },
                ].map((o) => {
                  const sel = o.v === freeShipping;
                  return (
                    <button
                      key={String(o.v)}
                      type="button"
                      onClick={() => setFreeShipping(o.v)}
                      className={cn(
                        "rounded-2xl border p-3 text-left transition",
                        sel ? "border-slate-900 bg-white ring-2 ring-slate-900" : "border-slate-200 bg-white hover:border-slate-300",
                      )}
                    >
                      <span className="block text-sm font-semibold text-slate-900">{o.label}</span>
                      <span className="block text-xs text-slate-400">{o.desc}</span>
                    </button>
                  );
                })}
              </div>
              {!freeShipping && (
                <div>
                  <Label htmlFor="pf-ship">{t("shipCostLabel")}</Label>
                  <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-200">
                    <span className="bg-slate-50 px-3 py-2 text-sm text-slate-500">€</span>
                    <input
                      id="pf-ship"
                      value={shippingPrice}
                      onChange={(e) => setShippingPrice(e.target.value)}
                      inputMode="decimal"
                      placeholder="4.90"
                      className="min-w-0 flex-1 px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
              )}
              <div>
                <Label htmlFor="pf-stock">{t("stockLabel")}</Label>
                <Input id="pf-stock" name="stock" type="number" min={0} defaultValue={product?.stock ?? undefined} placeholder={t("stockPlaceholder")} />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="pf-desc">{t("descLabel")}</Label>
            <Textarea id="pf-desc" name="description" rows={3} defaultValue={product?.description ?? undefined} placeholder={t("descPlaceholder")} />
          </div>

          <Switch
            name="isPublished"
            defaultChecked={product ? product.isPublished : true}
            label={t("publishedLabel")}
            hint={t("publishedHint")}
          />

          {isEdit && (
            <div className="border-t border-slate-100 pt-6">
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                <Icon name="archive" size={16} />
                {deleting ? t("deleting") : t("deleteProduct")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          {t("cancel")}
        </button>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50">
          {pending ? t("saving") : isEdit ? t("saveChanges") : t("createProduct")}
        </button>
      </div>
    </form>
  );
}

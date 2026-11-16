"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Pill, FormError } from "@/components/ui/misc";
import { cn, formatPrice } from "@/lib/utils";
import { PricePointSelect } from "./price-point-select";
import { PLATFORM_CURRENCY } from "@/lib/currency";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { uploadMediaFile, useUploadErrorText } from "@/lib/client-upload";

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
  /** Kurszugang: der Kurs, den ein Kauf freischaltet (null = noch keiner). */
  courseId: string | null;
}

export interface ProductCourseOption {
  id: string;
  title: string;
  /** false: der Kurs hängt an einer Mitgliedschaft und ist nicht einzeln verkäuflich. */
  sellable: boolean;
}

// TIER_GRANT wird nicht mehr angeboten: ein Kauf kann eine Mitgliedschaft
// nicht sauber freischalten (dieselbe Berechtigung wie das Abo, das beim
// Kündigen wieder entzogen wird). Bestehende Produkte zeigen den Typ weiter.
const TYPES: { value: string; icon: IconName }[] = [
  { value: "DIGITAL", icon: "export" },
  { value: "PHYSICAL", icon: "archive" },
  { value: "BUNDLE", icon: "products" },
  { value: "COURSE_ACCESS", icon: "courses" },
];
const LEGACY_TYPES: { value: string; icon: IconName }[] = [
  { value: "TIER_GRANT", icon: "tiers" },
];
const typeIcon: Record<string, IconName> = Object.fromEntries(
  [...TYPES, ...LEGACY_TYPES].map((ty) => [ty.value, ty.icon]),
) as Record<string, IconName>;

const initial: ActionState = {};

/** Eigene Uploads liegen hinter /api/media und sind nur für Käufer lesbar. */
const isUploadedFile = (url: string) => url.startsWith("/api/media/");
const isHttpLink = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

export function ProductsManager({
  slug,
  products,
  courses,
  shopHref,
  payoutsReady,
  stripeReady,
  showSetupHint = false,
}: {
  slug: string;
  products: ProductRowData[];
  courses: ProductCourseOption[];
  /** Öffentliche Shop-Ansicht (SHOP-Space); null, wenn es keine gibt. */
  shopHref: string | null;
  /** Die Community hat ein Stripe-Konto für Auszahlungen (`stripeAccountId`). */
  payoutsReady: boolean;
  stripeReady: boolean;
  /** Env-Setup-Hinweis (STRIPE_SECRET_KEY) — nur für Plattform-Admins. */
  showSetupHint?: boolean;
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
          className="inline-flex items-center gap-2 self-start rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] active:scale-[0.98] sm:self-auto"
        >
          <Icon name="plus" size={18} />
          {t("create")}
        </button>
      </div>

      {!payoutsReady && products.some((p) => p.priceCents > 0) && (
        <PayoutsHint slug={slug} className="mb-5" />
      )}

      {!stripeReady && showSetupHint && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t.rich("stripeWarning", { code: (c) => <code>{c}</code> })}
        </div>
      )}

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-16 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
            <Icon name="products" size={24} />
          </span>
          <p className="mt-4 font-semibold text-slate-800">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("emptyText")}</p>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)]"
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
              <div
                key={p.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => setEditing(p)}
                  className="flex flex-1 flex-col text-left"
                >
                  <div className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden bg-slate-100">
                    {p.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.coverUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Icon name={icon} size={30} className="text-slate-400" />
                    )}
                    {p.images.length > 1 && (
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2 py-0.5 text-xs font-medium text-white">
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
                  <div className="flex flex-1 flex-col p-4 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <Pill className="bg-slate-100 text-slate-600">{tTypes(`${p.type}.label`)}</Pill>
                    </div>
                    {p.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">{p.description}</p>
                    )}
                    {p.requiresShipping && (
                      <p className="mt-1.5 text-xs text-slate-500">
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
                  </div>
                </button>
                <div className="mx-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-100 py-3">
                  <span className="text-sm">
                    <span className="font-semibold text-slate-900">
                      {formatPrice(p.priceCents, p.currency, locale)}
                    </span>
                    <span className="text-slate-500"> · {t("salesCount", { count: p.salesCount })}</span>
                  </span>
                  {shopHref && p.isPublished && (
                    <Link
                      href={shopHref}
                      className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
                    >
                      {t("viewInShop")}
                      <Icon name="arrowRight" size={14} />
                    </Link>
                  )}
                </div>
              </div>
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
        <ProductForm
          slug={slug}
          courses={courses}
          payoutsReady={payoutsReady}
          onDone={() => setCreateOpen(false)}
        />
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
            courses={courses}
            payoutsReady={payoutsReady}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

/** Creator ohne Stripe-Konto: Verkäufe brächten kein Geld an. */
function PayoutsHint({ slug, className }: { slug: string; className?: string }) {
  const t = useTranslations("dashboard.products");
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className,
      )}
    >
      <p>{t("payoutsMissing")}</p>
      <Link
        href={`/dashboard/${slug}/settings?tab=integrations`}
        className="shrink-0 font-semibold text-amber-900 underline underline-offset-2 hover:no-underline"
      >
        {t("payoutsSetup")}
      </Link>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm text-red-700">
      {message}
    </p>
  );
}

type FieldErrors = { price?: string; file?: string; course?: string };

function ProductForm({
  slug,
  product,
  courses,
  payoutsReady,
  onDone,
}: {
  slug: string;
  product?: ProductRowData;
  courses: ProductCourseOption[];
  payoutsReady: boolean;
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
  // Physisch: freier Betrag als Text. Digital: Preisstufe in Cents, "" = noch
  // nichts gewählt (auch „Kostenlos" muss eine bewusste Wahl sein).
  const [price, setPrice] = useState(
    product && product.priceCents > 0 ? (product.priceCents / 100).toString() : "",
  );
  const [pricePoint, setPricePoint] = useState(product ? String(product.priceCents) : "");
  const [fileUrl, setFileUrl] = useState(product?.downloadUrl ?? "");
  const [courseId, setCourseId] = useState(product?.courseId ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [freeShipping, setFreeShipping] = useState(product?.freeShipping ?? false);
  const [shippingPrice, setShippingPrice] = useState(
    product && product.shippingCents > 0 ? (product.shippingCents / 100).toString() : "",
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const cents = Math.max(0, Math.round(Number(price.replace(",", ".")) * 100) || 0);
  const shipCents = freeShipping
    ? 0
    : Math.max(0, Math.round(Number(shippingPrice.replace(",", ".")) * 100) || 0);
  const paid = type === "PHYSICAL" ? cents > 0 : Number(pricePoint) > 0;
  const types = product && LEGACY_TYPES.some((lt) => lt.value === product.type)
    ? [...TYPES, ...LEGACY_TYPES.filter((lt) => lt.value === product.type)]
    : TYPES;
  // Nach dem ersten Verkauf bleibt der Kurs fest: Käufer behalten so ihren Zugang.
  const courseLocked = !!product && product.salesCount > 0 && !!product.courseId;
  const sellableCourses = courses.filter((c) => c.sellable || c.id === product?.courseId);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (type !== "PHYSICAL" && pricePoint === "") next.price = t("priceRequired");
    if (type === "DIGITAL") {
      const url = fileUrl.trim();
      if (!url) next.file = t("fileRequired");
      else if (!isUploadedFile(url) && !isHttpLink(url)) next.file = t("fileLinkInvalid");
    }
    if (type === "COURSE_ACCESS" && !courseId) next.course = t("courseRequired");
    return next;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const next = validate();
    setErrors(next);
    const first = next.price ? "pf-price" : next.file ? "pf-file-link" : next.course ? "pf-course" : null;
    if (first) {
      e.preventDefault();
      // Upload-Zustand hat kein Link-Feld: dann zum Upload-Knopf.
      (document.getElementById(first) ?? document.getElementById("pf-file-upload"))?.focus();
    }
  }

  async function onDelete() {
    if (!product) return;
    const sold = product.salesCount > 0;
    const confirmed = await confirm({
      title: t(sold ? "confirmHide" : "confirmDelete", { name: product.name }),
      body: sold ? t("confirmHideBody") : t("confirmDeleteBody"),
      confirmLabel: sold ? t("hideProduct") : t("deleteProduct"),
      tone: "danger",
    });
    if (!confirmed) return;
    setDeleting(true);
    setDeleteError(undefined);
    const fd = new FormData();
    fd.set("tenant", slug);
    fd.set("productId", product.id);
    const result = await deleteProductAction(fd);
    if (result.error) {
      setDeleteError(result.error);
      setDeleting(false);
      return;
    }
    onDone();
  }

  return (
    <form action={action} onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="tenant" value={slug} />
      <input type="hidden" name="type" value={type} />
      {type === "PHYSICAL" && <input type="hidden" name="priceCents" value={cents} />}
      {type === "DIGITAL" && <input type="hidden" name="downloadUrl" value={fileUrl.trim()} />}
      {type === "COURSE_ACCESS" && <input type="hidden" name="courseId" value={courseId} />}
      <input type="hidden" name="freeShipping" value={freeShipping ? "true" : "false"} />
      <input type="hidden" name="shippingCents" value={shipCents} />
      {isEdit && <input type="hidden" name="productId" value={product!.id} />}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-7 px-6 py-10">
          <FormError message={deleteError ?? state.error} />

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
            <p id="pf-type" className="mb-3 text-sm font-medium text-slate-700">{t("typeLabel")}</p>
            <div role="group" aria-labelledby="pf-type" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              {types.map((pt) => {
                const sel = pt.value === type;
                return (
                  <button
                    key={pt.value}
                    type="button"
                    aria-pressed={sel}
                    onClick={() => {
                      setType(pt.value);
                      setErrors({});
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors duration-200",
                      sel
                        ? "border-[var(--action-strong)] bg-slate-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-[var(--action-soft)]",
                    )}
                  >
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition", sel ? "bg-[var(--action)] text-[var(--action-fg)]" : "bg-slate-100 text-slate-600")}>
                      <Icon name={pt.icon} size={18} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">{tTypes(`${pt.value}.label`)}</span>
                      <span className="block text-xs text-slate-500">{tTypes(`${pt.value}.desc`)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {type === "TIER_GRANT" && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {t("tierGrantRetired")}
              </p>
            )}
          </div>

          {type === "COURSE_ACCESS" && (
            <div>
              {sellableCourses.length > 0 ? (
                <Label htmlFor="pf-course">{t("courseLabel")}</Label>
              ) : (
                <p className="mb-1.5 text-sm font-medium text-slate-700">{t("courseLabel")}</p>
              )}
              {sellableCourses.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {t("noCourses")}{" "}
                  <Link
                    href={`/dashboard/${slug}/courses`}
                    className="font-semibold text-slate-900 underline underline-offset-2 hover:no-underline"
                  >
                    {t("createCourse")}
                  </Link>
                </p>
              ) : (
                <Select
                  id="pf-course"
                  value={courseId}
                  onChange={(v) => {
                    setCourseId(v);
                    setErrors((e) => ({ ...e, course: undefined }));
                  }}
                  placeholder={t("coursePlaceholder")}
                  disabled={courseLocked}
                >
                  {sellableCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </Select>
              )}
              <FieldError id="pf-course-error" message={errors.course} />
              <p className="mt-1.5 text-xs text-slate-500">
                {courseLocked ? t("courseLocked") : t("courseHint")}
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="pf-price">{t("priceLabel")}</Label>
            {type === "PHYSICAL" ? (
              <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-200">
                <span className="bg-slate-50 px-3 py-2 text-sm text-slate-500">{PLATFORM_CURRENCY.toUpperCase()}</span>
                <input
                  id="pf-price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="19.00"
                  className="min-w-0 flex-1 px-3 py-2 text-sm outline-none"
                />
              </div>
            ) : (
              <>
                <PricePointSelect
                  id="pf-price"
                  name="priceCents"
                  kind="oneTime"
                  allowFree
                  placeholder={t("pricePlaceholder")}
                  // Typwechsel montiert das Feld neu: die Auswahl bleibt erhalten.
                  defaultCents={pricePoint === "" ? undefined : Number(pricePoint)}
                  onChange={(v) => {
                    setPricePoint(v);
                    setErrors((e) => ({ ...e, price: undefined }));
                  }}
                />
                <FieldError id="pf-price-error" message={errors.price} />
                <p className="mt-1.5 text-xs text-slate-500">{t("priceHint")}</p>
              </>
            )}
            {paid && !payoutsReady && <PayoutsHint slug={slug} className="mt-3" />}
          </div>

          {type === "DIGITAL" && (
            <ProductFileField
              slug={slug}
              value={fileUrl}
              onChange={(v) => {
                setFileUrl(v);
                setErrors((e) => ({ ...e, file: undefined }));
              }}
              error={errors.file}
            />
          )}

          {type === "PHYSICAL" && (
            <div className="space-y-4 rounded-2xl bg-slate-50 p-4">
              <p id="pf-shipping" className="text-sm font-medium text-slate-700">{t("shipping")}</p>
              <div role="group" aria-labelledby="pf-shipping" className="grid grid-cols-2 gap-3">
                {[
                  { v: true, label: t("shipFreeLabel"), desc: t("shipFreeDesc") },
                  { v: false, label: t("shipPaidLabel"), desc: t("shipPaidDesc") },
                ].map((o) => {
                  const sel = o.v === freeShipping;
                  return (
                    <button
                      key={String(o.v)}
                      type="button"
                      aria-pressed={sel}
                      onClick={() => setFreeShipping(o.v)}
                      className={cn(
                        "rounded-2xl border p-3 text-left transition",
                        sel ? "border-[var(--action-strong)] bg-white ring-2 ring-[var(--action-strong)]" : "border-slate-200 bg-white hover:border-slate-300",
                      )}
                    >
                      <span className="block text-sm font-semibold text-slate-900">{o.label}</span>
                      <span className="block text-xs text-slate-500">{o.desc}</span>
                    </button>
                  );
                })}
              </div>
              {!freeShipping && (
                <div>
                  <Label htmlFor="pf-ship">{t("shipCostLabel")}</Label>
                  <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-200">
                    <span className="bg-slate-50 px-3 py-2 text-sm text-slate-500">{PLATFORM_CURRENCY.toUpperCase()}</span>
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
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
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
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)] active:scale-[0.98] disabled:opacity-50">
          {pending ? t("saving") : isEdit ? t("saveChanges") : t("createProduct")}
        </button>
      </div>
      {confirmDialog}
    </form>
  );
}

/** Dateiformate, die der Upload für Produktdateien annimmt (lib/upload-policy). */
const PRODUCT_FILE_ACCEPT =
  ".pdf,.zip,.docx,.xlsx,.pptx,image/png,image/jpeg,image/webp,image/gif,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,video/mp4,video/webm,video/quicktime";

/**
 * „Datei für Käufer": eigener Upload (nur für Käufer lesbar) oder ein Link.
 * Schreibt die URL über `onChange` hoch; das versteckte Feld `downloadUrl`
 * setzt das Formular.
 */
function ProductFileField({
  slug,
  value,
  onChange,
  error,
}: {
  slug: string;
  value: string;
  onChange: (url: string) => void;
  error?: string;
}) {
  const t = useTranslations("dashboard.products");
  const uploadErrorText = useUploadErrorText();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const uploaded = isUploadedFile(value);
  const message = uploadError ?? error;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const url = await uploadMediaFile({ file, tenant: slug, purpose: "product-file" });
      setFileName(file.name);
      onChange(url);
    } catch (err) {
      setUploadError(uploadErrorText(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <fieldset aria-describedby="pf-file-hint">
      <legend className="mb-1.5 block text-sm font-medium text-slate-700">{t("fileLabel")}</legend>
      <p id="pf-file-hint" className="mb-3 text-xs text-slate-500">{t("fileHint")}</p>

      {uploaded ? (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
            <Icon name="check" size={16} className="shrink-0 text-emerald-700" />
            <span className="truncate">{fileName ?? t("fileUploaded")}</span>
          </span>
          <span className="flex shrink-0 flex-wrap items-center gap-3 text-sm font-medium">
            <a href={value} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-slate-900">
              {t("fileOpen")}
            </a>
            <button
              id="pf-file-upload"
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-slate-600 hover:text-slate-900 disabled:opacity-50"
            >
              {uploading ? t("fileUploading") : t("fileReplace")}
            </button>
            <button
              type="button"
              onClick={() => {
                setFileName(null);
                onChange("");
              }}
              className="text-red-700 hover:underline"
            >
              {t("fileRemove")}
            </button>
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            id="pf-file-upload"
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <Icon name="export" size={16} />
            {uploading ? t("fileUploading") : t("fileUpload")}
          </button>
          <div>
            <Label htmlFor="pf-file-link">{t("fileLinkLabel")}</Label>
            <Input
              id="pf-file-link"
              inputMode="url"
              autoComplete="off"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://…"
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? "pf-file-error" : undefined}
            />
          </div>
        </div>
      )}
      <FieldError id="pf-file-error" message={message ?? undefined} />
      <input
        ref={fileRef}
        type="file"
        accept={PRODUCT_FILE_ACCEPT}
        className="hidden"
        onChange={onPick}
      />
    </fieldset>
  );
}

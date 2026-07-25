"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { updateTenantSeoAction, type SeoState } from "@/app/actions/seo";
import { PageHeader } from "./page-header";
import { Icon } from "./icons";
import { Input, Label, Textarea } from "@/components/ui/field";
import { ImageUpload } from "./image-upload";
import { FormError } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export interface SeoFormValues {
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  seoImageUrl: string;
  seoNoindex: boolean;
}

/** Was ausgeliefert wird, wenn ein Feld leer bleibt — aus den Community-Angaben. */
export interface SeoDerived {
  title: string;
  description: string;
  keywords: string;
  imageUrl: string | null;
  url: string;
}

const TITLE_MAX = 70;
const DESC_MAX = 200;

export function SeoManager({
  slug,
  values,
  derived,
  communityName,
}: {
  slug: string;
  values: SeoFormValues;
  derived: SeoDerived;
  communityName: string;
}) {
  const t = useTranslations("dashboard.seo");
  const [state, action, pending] = useActionState(updateTenantSeoAction, {} as SeoState);
  const [title, setTitle] = useState(values.seoTitle);
  const [description, setDescription] = useState(values.seoDescription);
  const [image, setImage] = useState(values.seoImageUrl);
  const [noindex, setNoindex] = useState(values.seoNoindex);
  const [saved, setSaved] = useState(false);
  const ids = { title: useId(), desc: useId(), kw: useId(), img: useId() };

  useEffect(() => {
    if (!state.ok) return;
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 2600);
    return () => clearTimeout(timer);
  }, [state.ok]);

  // Die Vorschau zeigt immer den *effektiven* Wert: leer heisst abgeleitet,
  // nicht leer. Genau so entscheidet auch lib/seo.ts auf dem Server.
  const effectiveTitle = title.trim() || derived.title;
  const effectiveDesc = description.trim() || derived.description;
  const effectiveImage = image.trim() || derived.imageUrl;
  const prettyUrl = derived.url.replace(/^https?:\/\//, "");

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <form action={action} className="space-y-5">
          <input type="hidden" name="tenant" value={slug} />
          <FormError message={state.error} />

          <Field
            id={ids.title}
            label={t("metaTitle")}
            hint={t("metaTitleHint")}
            count={{ value: title.length, max: TITLE_MAX }}
          >
            <Input
              id={ids.title}
              name="seoTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              placeholder={derived.title}
            />
          </Field>

          <Field
            id={ids.desc}
            label={t("metaDescription")}
            hint={t("metaDescriptionHint")}
            count={{ value: description.length, max: DESC_MAX }}
          >
            <Textarea
              id={ids.desc}
              name="seoDescription"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESC_MAX}
              placeholder={derived.description}
            />
          </Field>

          <Field id={ids.kw} label={t("keywords")} hint={t("keywordsHint")}>
            <Input
              id={ids.kw}
              name="seoKeywords"
              defaultValue={values.seoKeywords}
              placeholder={derived.keywords}
            />
          </Field>

          <div>
            <Label htmlFor={ids.img}>{t("image")}</Label>
            {/* Bewusst der vorhandene Tenant-Upload: das Bild gehoert der
                Community, faellt also unter ihr Kontingent und ihre Mediathek. */}
            <ImageUpload
              tenant={slug}
              name="seoImageUrl"
              purpose="seo-image"
              defaultUrl={values.seoImageUrl || null}
              onChange={setImage}
            />
            <p className="mt-1.5 text-xs leading-5 text-slate-400">{t("imageHint")}</p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <input
              type="checkbox"
              name="seoNoindex"
              checked={noindex}
              onChange={(e) => setNoindex(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-2 focus:ring-[var(--brand-ring)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-800">
                {t("noindex")}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                {t("noindexHint")}
              </span>
            </span>
          </label>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--action)] px-5 py-2.5 text-sm font-semibold text-[var(--action-fg)] transition hover:bg-[var(--action-hover)] active:scale-[0.98] disabled:opacity-50"
            >
              {pending ? t("saving") : t("save")}
            </button>
            {saved && (
              <span
                role="status"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600"
              >
                <Icon name="check" size={16} />
                {t("saved")}
              </span>
            )}
          </div>
        </form>

        {/* ------------------------------------------------------- Vorschau */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">
              {t("previewSearch")}
            </p>
            {/* Bewusst der Google-Snippet-Aufbau: URL, blauer Titel, Grautext. */}
            <div className="space-y-1">
              <p className="truncate text-xs text-slate-500">{prettyUrl}</p>
              <p className="truncate text-lg leading-snug text-[#1a0dab]">
                {effectiveTitle}
              </p>
              <p className="line-clamp-2 text-sm leading-6 text-slate-600">
                {effectiveDesc}
              </p>
            </div>
            {noindex && (
              <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                <Icon name="alert" size={13} className="shrink-0" />
                {t("noindexWarning")}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">
              {t("previewSocial")}
            </p>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="relative aspect-[1.91/1] bg-slate-100">
                {effectiveImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={effectiveImage}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-slate-300">
                    <Icon name="gallery" size={28} />
                  </span>
                )}
              </div>
              <div className="bg-slate-50 px-3.5 py-3">
                <p className="truncate text-[11px] uppercase tracking-wide text-slate-400">
                  {prettyUrl}
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                  {effectiveTitle}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500">
                  {effectiveDesc}
                </p>
              </div>
            </div>
          </div>

          <p className="px-1 text-xs leading-5 text-slate-400">
            {t("derivedNote", { name: communityName })}
          </p>
        </aside>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  count,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  count?: { value: number; max: number };
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {count && (
          <span
            className={cn(
              "text-xs tabular-nums",
              count.value > count.max * 0.9 ? "text-amber-600" : "text-slate-400",
            )}
          >
            {count.value}/{count.max}
          </span>
        )}
      </div>
      {children}
      <p className="mt-1.5 text-xs leading-5 text-slate-400">{hint}</p>
    </div>
  );
}

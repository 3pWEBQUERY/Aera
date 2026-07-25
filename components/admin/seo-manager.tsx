"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { updatePlatformSeoAction, type SeoState } from "@/app/actions/seo";
import { Icon } from "@/components/dashboard/icons";
import { Input, Label, Textarea } from "@/components/ui/field";
import { PlatformImageUpload } from "./platform-image-upload";
import { FormError } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

interface Values {
  siteName: string;
  title: string;
  titleTemplate: string;
  description: string;
  keywords: string;
  imageUrl: string;
  twitterHandle: string;
  noindex: boolean;
}

const TITLE_MAX = 70;
const DESC_MAX = 200;

/**
 * Plattform-SEO fuer aera.so. Leere Felder fallen auf die eingebauten
 * Standardwerte zurueck (PLATFORM_SEO_DEFAULTS) — sie stehen als Platzhalter
 * im Feld, damit sichtbar ist, was ohne Eingabe ausgeliefert wird.
 */
export function PlatformSeoManager({
  values,
  defaults,
  effective,
  updatedAt,
}: {
  values: Values;
  defaults: Values;
  effective: Values;
  updatedAt: string | null;
}) {
  const t = useTranslations("admin.seo");
  const locale = useLocale();
  const [state, action, pending] = useActionState(updatePlatformSeoAction, {} as SeoState);
  const [title, setTitle] = useState(values.title);
  const [description, setDescription] = useState(values.description);
  const [image, setImage] = useState(values.imageUrl);
  const [noindex, setNoindex] = useState(values.noindex);
  const [saved, setSaved] = useState(false);
  const ids = {
    site: useId(), title: useId(), tmpl: useId(), desc: useId(),
    kw: useId(), img: useId(), tw: useId(),
  };

  useEffect(() => {
    if (!state.ok) return;
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 2600);
    return () => clearTimeout(timer);
  }, [state.ok]);

  const effTitle = title.trim() || defaults.title;
  const effDesc = description.trim() || defaults.description;
  const effImage = image.trim() || defaults.imageUrl;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
      </div>

      {noindex && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3"
        >
          <Icon name="alert" size={17} className="mt-0.5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-800">{t("noindexActiveTitle")}</p>
            <p className="mt-0.5 text-sm text-red-700">{t("noindexActiveText")}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <form action={action} className="space-y-5">
          <FormError message={state.error} />

          <Field id={ids.site} label={t("siteName")} hint={t("siteNameHint")}>
            <Input id={ids.site} name="siteName" defaultValue={values.siteName} placeholder={defaults.siteName} />
          </Field>

          <Field
            id={ids.title}
            label={t("homeTitle")}
            hint={t("homeTitleHint")}
            count={{ value: title.length, max: TITLE_MAX }}
          >
            <Input
              id={ids.title}
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              placeholder={defaults.title}
            />
          </Field>

          <Field id={ids.tmpl} label={t("titleTemplate")} hint={t("titleTemplateHint")}>
            <Input
              id={ids.tmpl}
              name="titleTemplate"
              defaultValue={values.titleTemplate}
              placeholder={defaults.titleTemplate}
            />
          </Field>

          <Field
            id={ids.desc}
            label={t("description")}
            hint={t("descriptionHint")}
            count={{ value: description.length, max: DESC_MAX }}
          >
            <Textarea
              id={ids.desc}
              name="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESC_MAX}
              placeholder={defaults.description}
            />
          </Field>

          <Field id={ids.kw} label={t("keywords")} hint={t("keywordsHint")}>
            <Input id={ids.kw} name="keywords" defaultValue={values.keywords} placeholder={defaults.keywords} />
          </Field>

          <div className="space-y-5">
            <div>
              <Label htmlFor={ids.img}>{t("image")}</Label>
              <PlatformImageUpload
                name="imageUrl"
                defaultUrl={values.imageUrl}
                onChange={setImage}
              />
              <p className="mt-1.5 text-xs leading-5 text-slate-400">{t("imageHint")}</p>
            </div>
            <Field id={ids.tw} label={t("twitter")} hint={t("twitterHint")}>
              <Input id={ids.tw} name="twitterHandle" defaultValue={values.twitterHandle} placeholder="@aera" />
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <input
              type="checkbox"
              name="noindex"
              checked={noindex}
              onChange={(e) => setNoindex(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-2 focus:ring-[var(--brand-ring)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-800">{t("noindex")}</span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">{t("noindexHint")}</span>
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
              <span role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                <Icon name="check" size={16} />
                {t("saved")}
              </span>
            )}
            {updatedAt && (
              <span className="ml-auto text-xs text-slate-400">
                {t("updatedAt", {
                  date: new Date(updatedAt).toLocaleDateString(locale, {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  }),
                })}
              </span>
            )}
          </div>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">
              {t("previewSearch")}
            </p>
            <div className="space-y-1">
              <p className="truncate text-xs text-slate-500">aera.so</p>
              <p className="truncate text-lg leading-snug text-[#1a0dab]">{effTitle}</p>
              <p className="line-clamp-2 text-sm leading-6 text-slate-600">{effDesc}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">
              {t("previewSocial")}
            </p>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="relative aspect-[1.91/1] bg-slate-100">
                {effImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={effImage} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-slate-300">
                    <Icon name="gallery" size={28} />
                  </span>
                )}
              </div>
              <div className="bg-slate-50 px-3.5 py-3">
                <p className="truncate text-[11px] uppercase tracking-wide text-slate-400">aera.so</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{effTitle}</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500">{effDesc}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">
              {t("effectiveTitle")}
            </p>
            <p className="text-xs leading-6 text-slate-500">
              {t("effectiveText", { template: effective.titleTemplate })}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
  id, label, hint, count, children,
}: {
  id: string; label: string; hint: string;
  count?: { value: number; max: number }; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {count && (
          <span className={cn("text-xs tabular-nums", count.value > count.max * 0.9 ? "text-amber-600" : "text-slate-400")}>
            {count.value}/{count.max}
          </span>
        )}
      </div>
      {children}
      <p className="mt-1.5 text-xs leading-5 text-slate-400">{hint}</p>
    </div>
  );
}

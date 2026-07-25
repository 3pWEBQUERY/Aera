"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/dashboard/icons";

/**
 * Upload for the platform og:image.
 *
 * Posts straight to /api/admin/seo-image rather than reusing the creator
 * ImageUpload: that one goes through the tenant pipeline (quota, media
 * library, per-tenant access rules), none of which applies to an asset that
 * belongs to no community.
 */
export function PlatformImageUpload({
  name,
  defaultUrl,
  onChange,
}: {
  name: string;
  defaultUrl: string;
  onChange?: (url: string) => void;
}) {
  const t = useTranslations("admin.seo.upload");
  const [url, setUrl] = useState(defaultUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function apply(next: string) {
    setUrl(next);
    onChange?.(next);
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/admin/seo-image", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !json.url) throw new Error(json.error || t("failed"));
      apply(json.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={url} />
      <div
        role="button"
        tabIndex={0}
        aria-busy={busy}
        onClick={() => !busy && fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!busy) fileRef.current?.click();
          }
        }}
        className="relative flex aspect-[1.91/1] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 transition hover:border-[var(--brand)] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-slate-400">
            <Icon name="gallery" size={26} />
            <span className="text-sm font-medium">{t("cta")}</span>
            <span className="text-xs">{t("hint")}</span>
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-[var(--brand)]" />
          </span>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        onChange={pick}
        className="hidden"
      />

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="text-xs font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900 disabled:opacity-50"
        >
          {url ? t("replace") : t("cta")}
        </button>
        {url && (
          <button
            type="button"
            onClick={() => apply("")}
            className="text-xs font-medium text-slate-400 underline underline-offset-2 hover:text-red-600"
          >
            {t("remove")}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

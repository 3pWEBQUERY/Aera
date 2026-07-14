"use client";

import { useRef, useState, useTransition } from "react";
import {
  setCommunityCoverAction,
  removeCommunityCoverAction,
} from "@/app/actions/cover";
import { Icon } from "./icons";
import { useTranslations } from "next-intl";

/**
 * Community hero cover. Uploads apply immediately (the newest cover wins);
 * removing falls back to the brand gradient.
 */
export function CoverUpload({
  tenant,
  defaultUrl,
}: {
  tenant: string;
  defaultUrl: string | null;
}) {
  const t = useTranslations("uiMigration.dashboard");
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("tenant", tenant);
      fd.set("purpose", "community-cover");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? t("uploadFailed"));
      } else {
        setUrl(json.url);
        const afd = new FormData();
        afd.set("tenant", tenant);
        startTransition(() => setCommunityCoverAction(afd));
      }
    } catch {
      setError(t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  function onRemove() {
    setUrl("");
    const fd = new FormData();
    fd.set("tenant", tenant);
    startTransition(() => removeCommunityCoverAction(fd));
  }

  return (
    <div>
      <div
        onClick={() => !uploading && fileRef.current?.click()}
        className="relative flex aspect-[4/1] w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Community-Header" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-slate-400">
            <Icon name="gallery" size={22} />
            <span className="text-sm font-medium">{t("uploadHeader")}</span>
            <span className="text-xs">{t("headerHint")}</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-[var(--brand)]" />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3">
        {url && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              {t("change")}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="text-sm font-medium text-red-600 hover:underline"
            >
              {t("remove")}
            </button>
          </>
        )}
        <span className="text-xs text-slate-400">{t("appliedImmediately")}</span>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}

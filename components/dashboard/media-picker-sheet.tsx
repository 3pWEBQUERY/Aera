"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sheet } from "./sheet";

export interface PickerImage {
  id: string;
  url: string;
  name: string;
  contentType: string;
}

/**
 * Media-Picker als Sheet: lädt die neuesten Bilder eines Tenants und gibt das
 * gewählte Bild per `onPick` zurück. Wird im AI-Assistenten über `/media`
 * geöffnet. Die eigentliche Verarbeitung (URL → Anhang) macht der Aufrufer.
 */
export function MediaPickerSheet({
  open,
  onClose,
  slug,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  onPick: (item: PickerImage) => void;
}) {
  const t = useTranslations("dashboard.assistant");
  const [items, setItems] = useState<PickerImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/dashboard/media/library?slug=${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: { items?: PickerImage[] }) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, slug]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("mediaPickerTitle")}
      subtitle={t("mediaPickerSubtitle")}
      icon="gallery"
    >
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-400">{t("mediaPickerLoading")}</p>
        ) : error ? (
          <p className="py-10 text-center text-sm text-red-500">{t("mediaPickerError")}</p>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">{t("mediaPickerEmpty")}</p>
        ) : (
          <div className="mx-auto grid max-w-4xl grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onPick(item)}
                title={item.name}
                className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

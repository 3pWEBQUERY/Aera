"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "./icons";

export type NameCheck = "idle" | "checking" | "available" | "taken" | "short" | "long" | "error";

/**
 * Debounced live availability check for a community name. Length is validated
 * locally; only plausible names hit the API.
 */
export function useNameAvailability(name: string, excludeSlug?: string): NameCheck {
  const [status, setStatus] = useState<NameCheck>("idle");

  useEffect(() => {
    const n = name.trim();
    if (n.length === 0) {
      setStatus("idle");
      return;
    }
    if (n.length < 2) {
      setStatus("short");
      return;
    }
    if (n.length > 60) {
      setStatus("long");
      return;
    }

    setStatus("checking");
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ name: n });
        if (excludeSlug) qs.set("exclude", excludeSlug);
        const res = await fetch(`/api/tenant/name-check?${qs.toString()}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const data = (await res.json()) as { status?: string };
        setStatus(data.status === "taken" ? "taken" : data.status === "available" ? "available" : "error");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("error");
      }
    }, 400);

    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [name, excludeSlug]);

  return status;
}

/** True when the name is safe to submit. */
export function nameOk(status: NameCheck): boolean {
  return status === "available" || status === "idle";
}

export function NameStatusHint({ status }: { status: NameCheck }) {
  const t = useTranslations("nameStatus");
  if (status === "idle") return null;

  if (status === "checking") {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
        <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-slate-300 border-t-slate-500" />
        {t("checking")}
      </p>
    );
  }
  if (status === "available") {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
        <Icon name="check" size={13} />
        {t("available")}
      </p>
    );
  }
  if (status === "taken") {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600">
        <Icon name="alert" size={13} />
        {t("taken")}
      </p>
    );
  }
  if (status === "short") {
    return <p className="mt-1.5 text-xs text-slate-400">{t("short")}</p>;
  }
  if (status === "long") {
    return <p className="mt-1.5 text-xs font-medium text-red-600">{t("long")}</p>;
  }
  return <p className="mt-1.5 text-xs text-slate-400">{t("error")}</p>;
}

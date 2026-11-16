"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { logoutAction } from "@/app/actions/auth";

/**
 * Konto oben rechts im Community-Kopf, neben der Glocke — dort, wo man es
 * sucht, auch auf dem Handy. Ein einfaches Aufklappmenü aus Links (kein
 * role="menu": das verlangte Pfeiltasten-Steuerung, die Links brauchen sie
 * nicht). Escape und ein Klick daneben schließen es, der Fokus kehrt zum
 * Avatar zurück.
 */
export function CommunityAccountMenu({
  slug,
  user,
  isStaff,
  moderatorOnly = false,
}: {
  slug: string;
  user: { name: string; avatarUrl: string | null };
  isStaff: boolean;
  /** Nur Moderator: der Eintrag führt direkt zur Moderation. */
  moderatorOnly?: boolean;
}) {
  const t = useTranslations("community.accountMenu");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const from = encodeURIComponent(pathname || `/c/${slug}`);
  const itemClass =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#161613] transition hover:bg-[#161613]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]";

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t("open", { name: user.name })}
        className="flex h-9 w-9 items-center justify-center rounded-full transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)] focus-visible:ring-offset-2"
      >
        <Avatar name={user.name} src={user.avatarUrl} size={32} />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-2 shadow-xl ring-1 ring-black/10"
        >
          <p className="truncate px-3 pb-2 pt-1.5 text-xs text-[#161613]/65">{user.name}</p>
          <ul className="space-y-0.5">
            <li>
              <Link href={`/member/account?from=${from}`} className={itemClass}>
                <Icon name="account" size={16} className="shrink-0 text-[#161613]/65" />
                {t("account")}
              </Link>
            </li>
            {isStaff && (
              <li>
                <Link href={moderatorOnly ? `/dashboard/${slug}/moderation` : `/dashboard/${slug}`} className={itemClass}>
                  <Icon name="dashboard" size={16} className="shrink-0 text-[#161613]/65" />
                  {moderatorOnly ? t("moderation") : t("creatorArea")}
                </Link>
              </li>
            )}
            <li>
              <form action={logoutAction}>
                <button type="submit" className={itemClass}>
                  <Icon name="logout" size={16} className="shrink-0 text-[#161613]/65" />
                  {t("logout")}
                </button>
              </form>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "./icons";
import { Sheet } from "./sheet";
import { MySubscription, type MySubscriptionData } from "./my-subscription";
import { logoutAction } from "@/app/actions/auth";
import { initials } from "@/lib/utils";

export function UserMenu({
  user,
  slug,
  subscription,
}: {
  user: { name: string; email: string; avatarUrl: string | null };
  slug: string;
  subscription: MySubscriptionData | null;
}) {
  const [open, setOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations("dashboard");

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition hover:bg-slate-100"
      >
        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-[var(--brand-soft)] text-xs font-semibold text-[var(--brand)] ring-1 ring-black/5">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
          ) : (
            initials(user.name)
          )}
        </span>
        <Icon name="expand" size={14} className="text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <div className="p-1.5">
            <Link
              href={`/c/${slug}`}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => setOpen(false)}
            >
              <Icon name="external" size={16} className="text-slate-400" />
              {t("topbar.viewCommunity")}
            </Link>
            {subscription && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setSubOpen(true);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              >
                <Icon name="tiers" size={16} className="text-slate-400" />
                {t("userMenu.mySubscription")}
              </button>
            )}
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => setOpen(false)}
            >
              <Icon name="spaces" size={16} className="text-slate-400" />
              {t("userMenu.switchCommunities")}
            </Link>
            <form action={logoutAction}>
              <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                <Icon name="logout" size={16} />
                {t("userMenu.logout")}
              </button>
            </form>
          </div>
        </div>
      )}

      {subscription && (
        <Sheet
          open={subOpen}
          onClose={() => setSubOpen(false)}
          title={t("userMenu.mySubscription")}
          subtitle={subscription.tenantName}
          icon="tiers"
        >
          <MySubscription slug={slug} data={subscription} />
        </Sheet>
      )}
    </div>
  );
}

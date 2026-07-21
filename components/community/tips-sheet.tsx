"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sheet } from "@/components/dashboard/sheet";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { TipForm } from "./tip-form";

export interface TipEntry {
  id: string;
  name: string;
  avatarUrl: string | null;
  amount: string;
  time: string;
  message: string | null;
}

/**
 * Member-facing tips space as a full-screen popover (same Sheet as the
 * dashboard managers): goal progress, tip form and the public tip wall.
 * Closing navigates back to the community home.
 */
export function TipsSheet({
  slug,
  space,
  spaceName,
  isMember,
  raised,
  goal,
  pct,
  tipped,
  errorKey,
  tips,
}: {
  slug: string;
  space: string;
  spaceName: string;
  isMember: boolean;
  raised: string;
  goal: string | null;
  pct: number;
  tipped: boolean;
  errorKey: "amountError" | "checkoutError" | null;
  tips: TipEntry[];
}) {
  const t = useTranslations("community.render.tips");
  const router = useRouter();
  // Erst nach dem Mount öffnen: vermeidet den SSR/CSR-Hydration-Mismatch des
  // Portals und ergibt die Slide-up-Animation beim Aufruf der Route.
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(true), []);
  const close = () => {
    setOpen(false);
    setTimeout(() => router.push(`/c/${slug}`), 260);
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      title={spaceName}
      subtitle={goal ? t("goal", { goal }) : undefined}
      icon="heart"
    >
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#f4f1ea]/40 px-5 py-8">
        <div className="mx-auto w-full max-w-2xl">
          {goal && (
            <div className="mb-6 rounded-2xl border border-[#161613]/10 bg-white p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-[#161613]">{raised}</span>
                <span className="text-[#161613]/50">{t("goal", { goal })}</span>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#161613]/10">
                <div
                  className="h-full rounded-full bg-[var(--brand)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
          {tipped && (
            <p
              role="status"
              className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
            >
              {t("thanks")}
            </p>
          )}
          {errorKey && (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              {t(errorKey)}
            </p>
          )}
          {isMember && <TipForm slug={slug} space={space} />}
          {tips.length === 0 ? (
            <EmptyState icon="heart" title={t("empty")} hint={t("emptyHint")} />
          ) : (
            <div className="space-y-3">
              {tips.map((tp) => (
                <div
                  key={tp.id}
                  className="flex items-start gap-3 rounded-2xl border border-[#161613]/10 bg-white p-4"
                >
                  <Avatar name={tp.name} src={tp.avatarUrl} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-semibold text-[#161613]">{tp.name}</span>{" "}
                      <span className="text-[color:var(--brand)]">{tp.amount}</span>{" "}
                      <span className="text-xs font-normal text-[#161613]/45">· {tp.time}</span>
                    </p>
                    {tp.message && (
                      <p className="mt-0.5 text-sm text-[#161613]/70">{tp.message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

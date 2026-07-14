import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { Card, CardBody } from "@/components/ui/card";
import { Icon, type IconName } from "./icons";
import { Pill } from "@/components/ui/misc";
import type { ContentPlanType, ContentPlanStatus } from "@/app/generated/prisma/client";

const TYPE_ICON: Record<ContentPlanType, IconName> = {
  POST: "feed",
  VIDEO: "videos",
  STREAM: "videos",
  STORY: "sparkles",
  NEWSLETTER: "newsletter",
  EVENT: "events",
  PRODUCT_DROP: "products",
  OTHER: "events",
};
const STATUS_CLS: Record<ContentPlanStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  PLANNED: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-600",
};

/** Overview widget: the next unfinished content plans. */
export async function PlannerUpcoming({ slug, tenantId }: { slug: string; tenantId: string }) {
  const [t, locale] = await Promise.all([
    getTranslations("dashboard.planner"),
    getLocale(),
  ]);
  const plans = await prisma.contentPlan.findMany({
    where: {
      tenantId,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      OR: [{ scheduledAt: { gte: new Date() } }, { scheduledAt: null }],
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    take: 5,
    select: { id: true, title: true, type: true, status: true, scheduledAt: true },
  });
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">{t("upcomingTitle")}</h2>
          <Link href={`/dashboard/${slug}/planner`} className="text-sm font-medium text-[color:var(--brand)] hover:underline">
            {t("upcomingViewAll")}
          </Link>
        </div>
        {plans.length === 0 ? (
          <div className="mt-3 flex flex-col items-start gap-2">
            <p className="text-sm text-slate-500">{t("upcomingEmpty")}</p>
            <Link href={`/dashboard/${slug}/planner`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--brand)]">
              <Icon name="plus" size={15} />
              {t("upcomingCta")}
            </Link>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {plans.map((p) => (
              <li key={p.id}>
                <Link href={`/dashboard/${slug}/planner`} className="flex items-center gap-3 py-3 transition hover:opacity-80">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <Icon name={TYPE_ICON[p.type]} size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{p.title}</p>
                    <p className="text-xs text-slate-400">
                      {t(`type.${p.type}`)}
                      {p.scheduledAt ? ` · ${dateFmt.format(p.scheduledAt)}` : ""}
                    </p>
                  </div>
                  <Pill className={STATUS_CLS[p.status]}>{t(`status.${p.status}`)}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

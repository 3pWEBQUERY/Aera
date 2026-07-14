import { requireTenantAdmin } from "@/lib/guards";
import { getTranslations, getLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import { features } from "@/lib/env";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Pill, EmptyState } from "@/components/ui/misc";
import {
  approveFlagAction,
  removeFlaggedContentAction,
} from "@/app/actions/moderation";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.moderation");
  return { title: t("metaTitle") };
}

const CATEGORY_CLS: Record<string, string> = {
  spam: "bg-amber-50 text-amber-700",
  toxisch: "bg-red-50 text-red-600",
  belaestigung: "bg-red-50 text-red-600",
};

export default async function ModerationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug, "MODERATOR");
  const t = await getTranslations("dashboard.moderation");
  const tCat = await getTranslations("dashboard.moderation.categories");
  const locale = await getLocale();
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const [pending, resolved] = await Promise.all([
    prisma.moderationFlag.findMany({
      where: { tenantId: tenant.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.moderationFlag.findMany({
      where: { tenantId: tenant.id, status: { not: "PENDING" } },
      orderBy: { resolvedAt: "desc" },
      take: 10,
    }),
  ]);

  const authorIds = [...new Set(pending.map((f) => f.authorId).filter(Boolean))] as string[];
  const authors = authorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true },
      })
    : [];
  const authorBy = new Map(authors.map((a) => [a.id, a.name]));

  return (
    <div>
      <PageHeader
        title={t("title")}
        subtitle={features.gemini ? t("subtitleAi") : t("subtitleHeuristic")}
      />

      {pending.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          hint={t("emptyHint")}
          icon="check"
        />
      ) : (
        <div className="space-y-3">
          {pending.map((f) => {
            const catCls = CATEGORY_CLS[f.category] ?? "bg-slate-100 text-slate-600";
            const catLabel = tCat.has(f.category) ? tCat(f.category) : f.category;
            return (
              <Card key={f.id}>
                <CardBody>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill className={catCls}>{catLabel}</Pill>
                    <Pill className="bg-slate-100 text-slate-500">
                      {f.refType === "Post" ? t("refPost") : t("refComment")}
                    </Pill>
                    <span className="text-xs text-slate-400">
                      {f.authorId ? authorBy.get(f.authorId) ?? t("unknown") : t("unknown")} ·{" "}
                      {dateFmt.format(f.createdAt)} ·{" "}
                      {f.source === "gemini" ? t("sourceAi") : t("sourceHeuristic")}: {f.reason}
                    </span>
                  </div>
                  <p className="mt-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    „{f.excerpt}“
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <form action={approveFlagAction}>
                      <input type="hidden" name="tenant" value={slug} />
                      <input type="hidden" name="id" value={f.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        {t("approve")}
                      </button>
                    </form>
                    <form action={removeFlaggedContentAction}>
                      <input type="hidden" name="tenant" value={slug} />
                      <input type="hidden" name="id" value={f.id} />
                      <button
                        type="submit"
                        className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700"
                      >
                        {t("removeContent")}
                      </button>
                    </form>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <Card className="mt-8">
          <CardBody>
            <h2 className="mb-2 text-sm font-bold text-slate-900">
              {t("recentDecisions")}
            </h2>
            <ul className="divide-y divide-slate-100">
              {resolved.map((f) => (
                <li key={f.id} className="flex items-center gap-2 py-2 text-sm">
                  <Pill
                    className={
                      f.status === "REMOVED"
                        ? "bg-red-50 text-red-600"
                        : "bg-emerald-50 text-emerald-700"
                    }
                  >
                    {f.status === "REMOVED" ? t("statusRemoved") : t("statusApproved")}
                  </Pill>
                  <span className="min-w-0 flex-1 truncate text-slate-500">
                    „{f.excerpt.slice(0, 80)}“
                  </span>
                  <span className="text-xs text-slate-400">
                    {f.resolvedAt ? dateFmt.format(f.resolvedAt) : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

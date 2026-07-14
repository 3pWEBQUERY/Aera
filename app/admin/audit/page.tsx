import type { Metadata } from "next";
import { getTranslations, getLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/guards";
import { AdminPagination } from "@/components/admin/pagination";
import { EmptyState } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.nav");
  return { title: t("audit") };
}

const PAGE_SIZE = 50;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePlatformAdmin();
  const t = await getTranslations("admin.audit");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale);
  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, Number(pageRaw) || 1);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.auditLog.count(),
  ]);

  // Resolve actor & tenant names in one query each.
  const actorIds = [
    ...new Set(logs.map((l) => l.actorUserId).filter((v): v is string => !!v)),
  ];
  const tenantIds = [
    ...new Set(logs.map((l) => l.tenantId).filter((v): v is string => !!v)),
  ];
  const [actors, tenants] = await Promise.all([
    actorIds.length
      ? prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve([]),
    tenantIds.length
      ? prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const actorById = new Map(actors.map((a) => [a.id, a]));
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("subtitle", { count: nf.format(total) })}
        </p>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon="knowledge"
          title={t("emptyTitle")}
          hint={t("emptyHint")}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {logs.map((l) => {
              const actor = l.actorUserId ? actorById.get(l.actorUserId) : null;
              const tenant = l.tenantId ? tenantById.get(l.tenantId) : null;
              const meta = JSON.stringify(l.metadata);
              const showMeta = meta && meta !== "{}" && meta !== "null";
              return (
                <li
                  key={l.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 sm:flex-nowrap"
                >
                  <span className="w-32 shrink-0 text-xs tabular-nums text-slate-400">
                    {formatDateTime(l.createdAt, locale)}
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs font-medium text-slate-700">
                    {l.action}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
                    {actor ? (
                      <span className="font-medium text-slate-800">{actor.name}</span>
                    ) : (
                      <span className="text-slate-400">{t("system")}</span>
                    )}
                    {tenant && <span className="text-slate-400"> · {tenant.name}</span>}
                    {l.targetType && (
                      <span className="text-xs text-slate-400">
                        {" "}
                        · {l.targetType}
                        {l.targetId ? `#${l.targetId}` : ""}
                      </span>
                    )}
                  </span>
                  {showMeta && (
                    <span
                      className="max-w-xs shrink-0 truncate font-mono text-xs text-slate-300"
                      title={meta}
                    >
                      {meta}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <AdminPagination
        basePath="/admin/audit"
        page={page}
        pageCount={Math.ceil(total / PAGE_SIZE)}
      />
    </div>
  );
}

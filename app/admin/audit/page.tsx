import type { Metadata } from "next";
import { getTranslations, getLocale } from "next-intl/server";
import prisma, { systemPrisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/guards";
import { AdminPagination } from "@/components/admin/pagination";
import { EmptyState } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils";
import {
  asMeta,
  auditEventKey,
  auditMessageId,
  hasDetails,
  humanizeAction,
  targetFromMetadata,
} from "./describe";

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

  // Namen fuer Akteur, Community und Ziel: je Typ eine Abfrage.
  const actorIds = [
    ...new Set(logs.map((l) => l.actorUserId).filter((v): v is string => !!v)),
  ];
  const tenantIds = [
    ...new Set(logs.map((l) => l.tenantId).filter((v): v is string => !!v)),
  ];
  const idsOf = (type: string) => [
    ...new Set(
      logs
        .filter((l) => l.targetType === type && l.targetId)
        .map((l) => l.targetId as string),
    ),
  ];
  const lookup = async <T extends { id: string }>(
    ids: string[],
    run: (ids: string[]) => Promise<T[]>,
  ): Promise<T[]> => (ids.length ? run(ids) : []);

  const [actors, tenants, targetLabels] = await Promise.all([
    lookup(actorIds, (ids) =>
      prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true },
      }),
    ),
    lookup([...new Set([...tenantIds, ...idsOf("Tenant")])], (ids) =>
      prisma.tenant.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      }),
    ),
    resolveTargetLabels(idsOf),
  ]);
  const actorById = new Map(actors.map((a) => [a.id, a]));
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("subtitle", { count: total })}
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
              const meta = asMeta(l.metadata);
              const actor = l.actorUserId ? actorById.get(l.actorUserId) : null;
              // „System" nur, wenn wirklich niemand gehandelt hat.
              const actorName = actor
                ? actor.name || actor.email
                : l.actorUserId
                  ? t("deletedAccount")
                  : meta.guest === true
                    ? t("guest")
                    : t("system");
              const tenant = l.tenantId ? tenantById.get(l.tenantId) : null;
              const targetIsTenant = l.targetType === "Tenant";
              const target =
                (targetIsTenant && l.targetId ? tenantById.get(l.targetId)?.name : null) ??
                (l.targetType && l.targetId
                  ? targetLabels.get(`${l.targetType}:${l.targetId}`)
                  : null) ??
                targetFromMetadata(meta);
              // Ist das Ziel die Community selbst, steht sie schon als Ziel da.
              const community =
                tenant && !(targetIsTenant && l.targetId === l.tenantId) ? tenant.name : null;
              const key = auditEventKey(l.action, meta);
              const messageId = key ? `events.${auditMessageId(key)}` : null;
              const sentence =
                messageId && t.has(messageId)
                  ? t(messageId, { actor: actorName })
                  : t("unknownEvent", { actor: actorName, action: humanizeAction(l.action) });
              const metaJson = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : null;
              return (
                <li
                  key={l.id}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <time
                    dateTime={l.createdAt.toISOString()}
                    className="shrink-0 text-xs tabular-nums text-slate-500 sm:w-36"
                  >
                    {formatDateTime(l.createdAt, locale)}
                  </time>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm text-slate-800">
                      {sentence}
                      {target && (
                        <>
                          {t("targetSeparator")}
                          <span className="font-semibold text-slate-900">{target}</span>
                        </>
                      )}
                      {community && (
                        <span className="text-slate-500">
                          {" · "}
                          {t("inCommunity", { community })}
                        </span>
                      )}
                    </p>
                    {hasDetails(l) && (
                      <details className="mt-1">
                        <summary className="inline-flex min-h-6 cursor-pointer items-center text-xs font-medium text-slate-600 hover:text-slate-900">
                          {t("details")}
                        </summary>
                        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                          <dt className="font-medium text-slate-700">{t("detailAction")}</dt>
                          <dd className="break-all font-mono">{l.action}</dd>
                          {l.targetType && (
                            <>
                              <dt className="font-medium text-slate-700">{t("detailTarget")}</dt>
                              <dd className="break-all font-mono">
                                {l.targetType}
                                {l.targetId ? ` ${l.targetId}` : ""}
                              </dd>
                            </>
                          )}
                          {l.tenantId && (
                            <>
                              <dt className="font-medium text-slate-700">{t("detailCommunity")}</dt>
                              <dd className="break-all font-mono">{l.tenantId}</dd>
                            </>
                          )}
                          {l.actorUserId && (
                            <>
                              <dt className="font-medium text-slate-700">{t("detailActor")}</dt>
                              <dd className="break-all font-mono">{l.actorUserId}</dd>
                            </>
                          )}
                          {metaJson && (
                            <>
                              <dt className="font-medium text-slate-700">{t("detailMetadata")}</dt>
                              <dd>
                                <pre className="whitespace-pre-wrap break-all font-mono">{metaJson}</pre>
                              </dd>
                            </>
                          )}
                        </dl>
                      </details>
                    )}
                  </div>
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

/**
 * Lesbare Namen fuer die haeufigsten Zieltypen. Was geloescht ist, faellt auf
 * die Metadaten zurueck (targetFromMetadata), sonst bleibt nur der Satz.
 */
async function resolveTargetLabels(
  idsOf: (type: string) => string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const put = (type: string, rows: { id: string; label: string | null | undefined }[]) => {
    for (const row of rows) if (row.label) map.set(`${type}:${row.id}`, row.label);
  };
  const run = async (
    type: string,
    query: (ids: string[]) => Promise<{ id: string; label: string | null | undefined }[]>,
  ) => {
    const ids = idsOf(type);
    if (ids.length) put(type, await query(ids));
  };
  const where = (ids: string[]) => ({ id: { in: ids } });
  await Promise.all([
    run("User", async (ids) =>
      (await systemPrisma.user.findMany({ where: where(ids), select: { id: true, name: true } }))
        .map((r) => ({ id: r.id, label: r.name })),
    ),
    run("Membership", async (ids) =>
      (
        await systemPrisma.membership.findMany({
          where: where(ids),
          select: { id: true, user: { select: { name: true } } },
        })
      ).map((r) => ({ id: r.id, label: r.user.name })),
    ),
    run("Space", async (ids) =>
      (await systemPrisma.space.findMany({ where: where(ids), select: { id: true, name: true } }))
        .map((r) => ({ id: r.id, label: r.name })),
    ),
    run("Event", async (ids) =>
      (await systemPrisma.event.findMany({ where: where(ids), select: { id: true, title: true } }))
        .map((r) => ({ id: r.id, label: r.title })),
    ),
    run("Course", async (ids) =>
      (await systemPrisma.course.findMany({ where: where(ids), select: { id: true, title: true } }))
        .map((r) => ({ id: r.id, label: r.title })),
    ),
    run("Product", async (ids) =>
      (await systemPrisma.product.findMany({ where: where(ids), select: { id: true, name: true } }))
        .map((r) => ({ id: r.id, label: r.name })),
    ),
    run("MembershipTier", async (ids) =>
      (
        await systemPrisma.membershipTier.findMany({ where: where(ids), select: { id: true, name: true } })
      ).map((r) => ({ id: r.id, label: r.name })),
    ),
    run("CommunityPage", async (ids) =>
      (
        await systemPrisma.communityPage.findMany({ where: where(ids), select: { id: true, title: true } })
      ).map((r) => ({ id: r.id, label: r.title })),
    ),
    run("NewsletterCampaign", async (ids) =>
      (
        await systemPrisma.newsletterCampaign.findMany({
          where: where(ids),
          select: { id: true, subject: true },
        })
      ).map((r) => ({ id: r.id, label: r.subject })),
    ),
    run("SupportTicket", async (ids) =>
      (
        await systemPrisma.supportTicket.findMany({ where: where(ids), select: { id: true, subject: true } })
      ).map((r) => ({ id: r.id, label: r.subject })),
    ),
    run("PlatformPost", async (ids) =>
      (
        await systemPrisma.platformPost.findMany({ where: where(ids), select: { id: true, title: true } })
      ).map((r) => ({ id: r.id, label: r.title })),
    ),
    run("Post", async (ids) =>
      (await systemPrisma.post.findMany({ where: where(ids), select: { id: true, title: true } }))
        .map((r) => ({ id: r.id, label: r.title })),
    ),
    run("PromoCode", async (ids) =>
      (await systemPrisma.promoCode.findMany({ where: where(ids), select: { id: true, code: true } }))
        .map((r) => ({ id: r.id, label: r.code })),
    ),
    run("LiveSession", async (ids) =>
      (
        await systemPrisma.liveSession.findMany({ where: where(ids), select: { id: true, title: true } })
      ).map((r) => ({ id: r.id, label: r.title })),
    ),
  ]);
  return map;
}

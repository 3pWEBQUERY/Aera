import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Avatar, EmptyState, Pill } from "@/components/ui/misc";
import { excerpt, formatPrice } from "@/lib/utils";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const { q } = await searchParams;
  const { tenant } = await requireTenantAdmin(slug);
  const term = (q ?? "").trim();
  const t = tenant.id;
  const tr = await getTranslations("dashboard.search");
  const locale = await getLocale();

  const contains = { contains: term, mode: "insensitive" as const };

  const [members, spaces, posts, products] = term
    ? await Promise.all([
        prisma.membership.findMany({
          where: {
            tenantId: t,
            user: { OR: [{ name: contains }, { email: contains }] },
          },
          include: { user: { select: { name: true, email: true, avatarUrl: true } }, tier: true },
          take: 8,
        }),
        prisma.space.findMany({
          where: { tenantId: t, OR: [{ name: contains }, { description: contains }] },
          take: 8,
        }),
        prisma.post.findMany({
          where: { tenantId: t, OR: [{ title: contains }, { body: contains }] },
          include: { space: { select: { slug: true } } },
          take: 8,
          orderBy: { createdAt: "desc" },
        }),
        prisma.product.findMany({
          where: { tenantId: t, OR: [{ name: contains }, { description: contains }] },
          take: 8,
        }),
      ])
    : [[], [], [], []];

  const total = members.length + spaces.length + posts.length + products.length;

  return (
    <div>
      <PageHeader
        title={term ? tr("titleWithTerm", { term }) : tr("title")}
        subtitle={term ? tr("resultsIn", { count: total, name: tenant.name }) : tr("enterTerm")}
      />

      {term && total === 0 && (
        <EmptyState icon="search" title={tr("noResults")} hint={tr("tryOther")} />
      )}

      <div className="space-y-6">
        {members.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">{tr("members")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {members.map((m) => (
                <Card key={m.id}>
                  <CardBody className="flex items-center gap-3 py-3">
                    <Avatar name={m.user.name} src={m.user.avatarUrl} size={36} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{m.user.name}</p>
                      <p className="truncate text-xs text-slate-400">{m.user.email}</p>
                    </div>
                    {m.tier && <Pill className="ml-auto bg-slate-100 text-slate-600">{m.tier.name}</Pill>}
                  </CardBody>
                </Card>
              ))}
            </div>
          </section>
        )}

        {spaces.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">{tr("spaces")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {spaces.map((s) => (
                <Link key={s.id} href={`/dashboard/${slug}/spaces`}>
                  <Card className="transition hover:shadow-md">
                    <CardBody className="py-3">
                      <p className="font-medium text-slate-800">{s.name}</p>
                      <p className="text-xs text-slate-400">{s.type} · /{s.slug}</p>
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {posts.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">{tr("posts")}</h2>
            <div className="space-y-3">
              {posts.map((p) => (
                <Link key={p.id} href={`/c/${slug}/s/${p.space.slug}/${p.id}`}>
                  <Card className="transition hover:shadow-md">
                    <CardBody className="py-3">
                      <p className="font-medium text-slate-800">
                        {p.title ?? excerpt(p.body, 60)}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">{excerpt(p.body, 120)}</p>
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {products.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">{tr("products")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {products.map((p) => (
                <Link key={p.id} href={`/dashboard/${slug}/products`}>
                  <Card className="transition hover:shadow-md">
                    <CardBody className="flex items-center justify-between py-3">
                      <p className="font-medium text-slate-800">{p.name}</p>
                      <span className="text-sm font-semibold text-slate-700">
                        {formatPrice(p.priceCents, "eur", locale)}
                      </span>
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

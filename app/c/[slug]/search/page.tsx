import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommunityContext } from "@/lib/guards";
import { searchCommunity, type SearchResultType } from "@/lib/search";
import { Icon, type IconName } from "@/components/dashboard/icons";
import { getTranslations } from "next-intl/server";

export const metadata = { title: "Suche" };

const TYPE_ICON: Record<SearchResultType, IconName> = {
  post: "feed",
  course: "courses",
  knowledge: "knowledge",
  event: "events",
  product: "products",
};

const TYPE_LABEL_KEY: Record<SearchResultType, string> = {
  post: "typePost",
  course: "typeCourse",
  knowledge: "typeKnowledge",
  event: "typeEvent",
  product: "typeProduct",
};

export default async function CommunitySearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const { q } = await searchParams;
  const community = await getCommunityContext(slug);
  if (!community) notFound();
  const { tenant, ctx } = community;
  const t = await getTranslations("search");

  const query = (q ?? "").trim();
  const results = query
    ? await searchCommunity(tenant.id, slug, ctx, query)
    : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[var(--brand-ring)]">
          <Icon name="search" size={20} />
        </span>
        <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
      </div>

      {/* GET-Formular — funktioniert ohne JavaScript. */}
      <form action={`/c/${slug}/search`} method="get" className="mb-6">
        <div className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={t("placeholder", { name: tenant.name })}
            autoFocus
            minLength={2}
            className="h-11 min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-5 text-sm text-slate-900 outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-ring)]"
          />
          <button
            type="submit"
            className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-[var(--brand)] px-5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <Icon name="search" size={16} />
            {t("submit")}
          </button>
        </div>
      </form>

      {query && query.length < 2 && (
        <p className="text-center text-sm text-slate-500">{t("minChars")}</p>
      )}

      {query.length >= 2 && results.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm font-medium text-slate-700">
            {t("noResults", { query })}
          </p>
          <p className="mt-1 text-sm text-slate-400">{t("tryAgain")}</p>
        </div>
      )}

      {results.length > 0 && (
        <>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
            {t("resultCount", { count: results.length })}
          </p>
          <ul className="space-y-2">
            {results.map((r) => {
              const meta = {
                label: t(TYPE_LABEL_KEY[r.type]),
                icon: TYPE_ICON[r.type],
              };
              return (
                <li key={`${r.type}:${r.id}`}>
                  <Link
                    href={r.locked ? `/c/${slug}/join` : r.href}
                    className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                      <Icon name={r.locked ? "lock" : meta.icon} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{r.title}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                          {meta.label}
                        </span>
                        {r.spaceName && (
                          <span className="text-xs text-slate-400">{r.spaceName}</span>
                        )}
                      </span>
                      {r.locked ? (
                        <span className="mt-1 block text-sm text-slate-400">
                          {t("lockedHint")}
                        </span>
                      ) : (
                        r.excerpt && (
                          <span className="mt-1 block text-sm text-slate-500">
                            {r.excerpt}
                          </span>
                        )
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

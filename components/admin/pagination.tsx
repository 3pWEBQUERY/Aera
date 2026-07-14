import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * Simple "Zurück / Weiter" pagination for the admin list pages.
 * Preserves the search query (`q`) plus optional extra query params
 * (`params`, e.g. filter tabs) in the links; renders nothing for one page.
 */
export async function AdminPagination({
  basePath,
  page,
  pageCount,
  q,
  params,
}: {
  basePath: string;
  page: number;
  pageCount: number;
  q?: string;
  /** Additional query params to preserve in the links (empty values are skipped). */
  params?: Record<string, string>;
}) {
  if (pageCount <= 1) return null;
  const t = await getTranslations("admin.pagination");

  const href = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) sp.set(key, value);
    }
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  return (
    <div className="flex items-center justify-center gap-1.5 pt-2">
      {page > 1 ? (
        <Link
          href={href(page - 1)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {t("prev")}
        </Link>
      ) : (
        <span className="cursor-not-allowed rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-300">
          {t("prev")}
        </span>
      )}
      <span className="px-3 text-sm text-slate-500">
        {t("pageOf", { page, pageCount })}
      </span>
      {page < pageCount ? (
        <Link
          href={href(page + 1)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {t("next")}
        </Link>
      ) : (
        <span className="cursor-not-allowed rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-300">
          {t("next")}
        </span>
      )}
    </div>
  );
}

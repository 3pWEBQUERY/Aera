import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SearchBox } from "./search-box";
import { UserMenu } from "./user-menu";
import type { MySubscriptionData } from "./my-subscription";
import { Icon } from "./icons";

export async function TopHeader({
  slug,
  user,
  leading,
  subscription = null,
}: {
  slug: string;
  user: { name: string; email: string; avatarUrl: string | null };
  /** Rendered before the search box — used for the mobile nav burger. */
  leading?: React.ReactNode;
  subscription?: MySubscriptionData | null;
}) {
  const t = await getTranslations("dashboard");
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-5">
      {leading}
      <div className="min-w-0 flex-1">
        <SearchBox slug={slug} />
      </div>
      <Link
        href={`/c/${slug}`}
        className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:flex"
      >
        <Icon name="external" size={16} className="text-slate-400" />
        {t("topbar.viewCommunity")}
      </Link>
      <UserMenu user={user} slug={slug} subscription={subscription} />
    </header>
  );
}

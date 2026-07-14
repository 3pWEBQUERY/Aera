import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePlatformAdmin } from "@/lib/guards";
import { AdminNav } from "@/components/admin/admin-nav";
import { Avatar } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: { default: "Admin — Aera", template: "%s — Aera Admin" },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requirePlatformAdmin();
  const t = await getTranslations("admin");

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-black text-white">
            A
          </span>
          <div>
            <p className="text-sm font-bold leading-none text-slate-900">{t("brand")}</p>
            <p className="mt-0.5 text-xs text-slate-400">{t("brandSubtitle")}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <AdminNav />
        </div>
        <div className="border-t border-slate-100 p-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition hover:bg-slate-50"
          >
            <Avatar name={admin.name} src={admin.avatarUrl} size={30} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-800">
                {admin.name}
              </span>
              <span className="block truncate text-xs text-slate-400">
                {t("backToDashboard")}
              </span>
            </span>
          </Link>
        </div>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">{children}</div>
      </main>
    </div>
  );
}

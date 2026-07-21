import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { requireUser } from "@/lib/guards";
import { userTenants } from "@/lib/tenant";
import prisma from "@/lib/prisma";
import { logoutAction } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/misc";
import { Icon } from "@/components/dashboard/icons";
import { MobileTabbar } from "@/components/home/mobile-tabbar";
import logoBlack from "@/public/logo_black.svg";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.index");
  return { title: t("metaTitle") };
}

export default async function DashboardIndex() {
  const user = await requireUser("/dashboard");
  const tenants = await userTenants(user.id);
  if (tenants.length === 0) redirect("/start");
  const t = await getTranslations("dashboard.index");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale);

  const counts = await Promise.all(
    tenants.map((t) =>
      prisma.membership.count({ where: { tenantId: t.id, status: "ACTIVE" } }),
    ),
  );

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-[#161613]">
      {/* Top bar */}
      <header className="border-b border-[#161613]/10">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/home" className="flex items-center">
            <Image src={logoBlack} alt="Aera" priority className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/member/account?from=/dashboard"
              className="hidden text-sm font-semibold text-[#161613]/60 transition hover:text-[#161613] sm:inline"
            >
              {t("yourMemberships")}
            </Link>
            <div className="flex items-center gap-2">
              <Avatar name={user.name} src={user.avatarUrl} size={32} />
              <span className="hidden text-sm font-medium text-[#161613]/80 md:inline">
                {user.name}
              </span>
            </div>
            <form action={logoutAction}>
              <button className="inline-flex min-h-9 items-center rounded-xl border border-[#161613]/15 px-4 text-sm font-semibold text-[#161613]/70 transition hover:border-[#161613]/40 hover:text-[#161613]">
                {t("logout")}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24 pt-12 md:pt-16">
        {/* Kopf */}
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#161613]/50">
          {t("eyebrow")}
        </p>
        <h1 className="display-serif mt-3 text-4xl leading-[1.05] sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-[#161613]/60">
          {t("subtitle")}
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tenants.map((tenant, i) => (
            <Link
              key={tenant.id}
              href={`/dashboard/${tenant.slug}`}
              className="group flex flex-col rounded-2xl border border-[#161613]/10 bg-white p-5 transition duration-300 hover:-translate-y-1 hover:border-[#161613]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25"
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className="display-serif flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl text-xl text-white"
                  style={{ backgroundColor: tenant.primaryColor }}
                >
                  {tenant.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tenant.logoUrl}
                      alt={tenant.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    tenant.name.charAt(0).toUpperCase()
                  )}
                </div>
                <Icon
                  name="arrowRight"
                  size={17}
                  className="mt-1 text-[#161613]/25 transition group-hover:translate-x-0.5 group-hover:text-[#161613]"
                />
              </div>
              <p className="display-serif mt-4 truncate text-xl leading-tight">
                {tenant.name}
              </p>
              <p className="mt-1 truncate text-xs text-[#161613]/45">/c/{tenant.slug}</p>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#161613]/45">
                {t("membersCount", { count: counts[i] })}
              </p>
            </Link>
          ))}

          {/* Neue Community */}
          <Link
            href="/start"
            className="flex min-h-[172px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#161613]/25 p-5 text-[#161613]/45 transition duration-300 hover:-translate-y-1 hover:border-[#161613]/60 hover:text-[#161613] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161613]/25"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-current">
              <Icon name="plus" size={20} />
            </span>
            <span className="display-serif mt-3 text-lg">{t("newCommunity")}</span>
          </Link>
        </div>
      </main>

      {/* App-Shell-Tabbar (mobil) — wie auf /home. */}
      <MobileTabbar
        user={{ name: user.name, avatarUrl: user.avatarUrl }}
      />
    </div>
  );
}

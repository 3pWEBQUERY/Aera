import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requirePlatformAdmin } from "@/lib/guards";
import { listAllTickets, markReadForStaff } from "@/lib/support";
import { TicketThreads } from "@/components/support/ticket-threads";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.support");
  return { title: t("metaTitle") };
}

export default async function AdminSupportPage() {
  await requirePlatformAdmin();
  const t = await getTranslations("admin.support");

  // Erst lesen, dann als gelesen markieren: sonst waeren die Treffer schon
  // beim ersten Rendern ungelesen-frei und man saehe nie, was neu war.
  const tickets = await listAllTickets();
  await markReadForStaff();

  const open = tickets.filter((x) => x.status === "OPEN").length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("subtitle", { open, total: tickets.length })}
        </p>
      </div>
      <TicketThreads tickets={tickets} side="staff" />
    </div>
  );
}

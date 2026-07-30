"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import prisma, { setTenantContext } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { parseHeroMenu, parseLayout } from "@/lib/layout";
import { nameStatus } from "@/lib/tenant-name";
import { tErr } from "@/lib/action-errors";
import { activeRoleAtLeast } from "@/lib/tenant";
import { safeHexColor } from "@/lib/color";

export interface LayoutState {
  ok?: boolean;
  error?: string;
}

function safeColor(v: string, fallback: string): string {
  return safeHexColor(v, fallback);
}

/**
 * Persist the community page-builder config plus the header fields it edits
 * (name, logo, brand color, "about"). The client submits a single JSON payload.
 */
export async function saveLayoutAction(
  _prev: LayoutState,
  fd: FormData,
): Promise<LayoutState> {
  const slug = String(fd.get("tenant"));
  const user = await getCurrentUser();
  if (!user) return { error: await tErr("notAuthenticated") };

  const tenant = await prisma.tenant.findUnique({ where: { slug, status: "ACTIVE" } });
  if (!tenant) return { error: await tErr("communityNotFound") };
  setTenantContext(tenant.id);

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (!activeRoleAtLeast(membership, "MODERATOR")) {
    return { error: await tErr("noPermission") };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(String(fd.get("payload") || "{}"));
  } catch {
    return { error: await tErr("invalidData") };
  }

  const layout = parseLayout({
    sectionsByAudience: payload.sectionsByAudience,
    nav: payload.nav,
    header: payload.header,
    // Die Menüzeile hat ihre eigene Seite. Wer nur das Seitenlayout speichert,
    // schickt sie nicht mit — dann bleibt der gespeicherte Stand stehen,
    // statt auf die Standardbelegung zurückzufallen.
    heroMenu: payload.heroMenu ?? (tenant.layout as { heroMenu?: unknown } | null)?.heroMenu,
  });

  const name = String(payload.name ?? tenant.name).trim().slice(0, 60) || tenant.name;
  if ((await nameStatus(name, slug)) === "taken") {
    return { error: await tErr("siteNameTaken") };
  }
  const logoUrl = typeof payload.logoUrl === "string" ? payload.logoUrl.trim() || null : tenant.logoUrl;
  const description =
    typeof payload.description === "string" ? payload.description.slice(0, 2000) || null : tenant.description;
  const primaryColor = safeColor(String(payload.primaryColor ?? ""), tenant.primaryColor);

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      name,
      logoUrl,
      description,
      primaryColor,
      layout: layout as unknown as object,
    },
  });

  // Das Live-Vorschau-Cookie überlagert für Staff die gespeicherte Version.
  // Nach dem Speichern löschen, damit der Creator sofort den DB-Stand sieht
  // (sonst zeigt /c/{slug} bis zu 15 Minuten den alten Vorschau-Zustand).
  (await cookies()).delete(`aera_preview_${slug}`);

  revalidatePath(`/c/${slug}`, "layout");
  revalidatePath(`/c/${slug}`);
  revalidatePath(`/dashboard/${slug}/layout`);
  return { ok: true };
}

/**
 * Nur die Menüzeile der Kopfzeile speichern.
 *
 * Eine eigene Aktion statt eines Zweigs in saveLayoutAction: die Menü-Seite
 * schickt nichts über Name, Logo oder Abschnitte mit, und ein gemeinsamer
 * Pfad müsste all das jedes Mal wieder zusammensetzen — mit dem Risiko, beim
 * Speichern des Menüs versehentlich etwas anderes zu überschreiben.
 */
export async function saveHeroMenuAction(
  _prev: LayoutState,
  fd: FormData,
): Promise<LayoutState> {
  const slug = String(fd.get("tenant"));
  const user = await getCurrentUser();
  if (!user) return { error: await tErr("notAuthenticated") };

  const tenant = await prisma.tenant.findUnique({ where: { slug, status: "ACTIVE" } });
  if (!tenant) return { error: await tErr("communityNotFound") };
  setTenantContext(tenant.id);

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (!activeRoleAtLeast(membership, "MODERATOR")) {
    return { error: await tErr("noPermission") };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(String(fd.get("payload") || "{}"));
  } catch {
    return { error: await tErr("invalidData") };
  }

  // Der gespeicherte Rest bleibt unangetastet: einlesen, Menü ersetzen,
  // zurückschreiben.
  const current = parseLayout(tenant.layout);
  const layout = { ...current, heroMenu: parseHeroMenu(payload) };

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { layout: layout as unknown as object },
  });

  (await cookies()).delete(`aera_preview_${slug}`);
  revalidatePath(`/c/${slug}`, "layout");
  revalidatePath(`/c/${slug}`);
  revalidatePath(`/dashboard/${slug}/menu`);
  return { ok: true };
}

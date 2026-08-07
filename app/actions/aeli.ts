"use server";

import { revalidatePath } from "next/cache";
import { systemPrisma } from "@/lib/prisma";
import { requireTenantAdmin } from "@/lib/guards";
import { writeAudit } from "@/lib/audit";
import { aeliHandleTaken } from "@/lib/aeli";
import { checkHandle, normalizeHandle, type HandleProblem } from "@/lib/aeli-handle";
import { issueLinkCode, linkCodesConfigured } from "@/lib/aeli-link-code";

/**
 * Die Aeli-Verbindung aus Aera heraus.
 *
 * Geschrieben wird ausschließlich `AeliProfile` — Aeras eigene Tabellen bleiben
 * unberührt. Über `systemPrisma`, weil die Aeli-Tabellen nicht zur
 * Tenant-Isolation gehören; jede Abfrage ist deshalb hier von Hand auf den
 * angemeldeten Nutzer bzw. die eigene Community begrenzt.
 *
 * Alle Aktionen verlangen OWNER. Eine Bio-Seite, die auf die Community zeigt,
 * ist deren öffentliches Gesicht an anderer Stelle — das entscheidet, wem sie
 * gehört, nicht wer sie moderiert.
 */

export interface AeliFormState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
  /** Ein frisch erzeugter Verbindungscode; nur zum Anzeigen. */
  code?: string;
}

const PROBLEM_TEXT: Record<HandleProblem | "taken", string> = {
  empty: "Bitte such dir einen Handle aus.",
  tooShort: "Mindestens 3 Zeichen.",
  tooLong: "Höchstens 30 Zeichen.",
  charset: "Erlaubt sind Kleinbuchstaben, Ziffern und Bindestriche.",
  edges: "Darf nicht mit einem Bindestrich anfangen oder enden.",
  doubleDash: "Zwei Bindestriche hintereinander gehen leider nicht.",
  numericOnly: "Nur Ziffern sehen aus wie eine Nummer, nicht wie ein Name.",
  reserved: "Dieser Handle ist für Aeli selbst reserviert.",
  taken: "Der ist schon vergeben.",
};

function settingsPath(slug: string): string {
  return `/dashboard/${slug}/settings`;
}

/**
 * Legt die Aeli-Seite dieses Kontos an und verknüpft sie sofort mit der
 * Community.
 *
 * Das Konto gibt es schon — Aera und Aeli teilen sich die `User`-Tabelle. Was
 * fehlt, ist der Handle. Deshalb steht hier ein Feld und kein „Konto erstellen".
 */
export async function createAeliPageAction(
  _prev: AeliFormState,
  form: FormData,
): Promise<AeliFormState> {
  const slug = String(form.get("tenant") ?? "");
  const { tenant, user } = await requireTenantAdmin(slug, "OWNER");

  const existing = await systemPrisma.aeliProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (existing) {
    return { error: "Dieses Konto hat bereits eine Aeli-Seite." };
  }

  const handle = normalizeHandle(String(form.get("handle") ?? "").slice(0, 60));
  const problem = checkHandle(handle);
  if (problem) return { fieldErrors: { handle: PROBLEM_TEXT[problem] } };
  if (await aeliHandleTaken(handle)) {
    return { fieldErrors: { handle: PROBLEM_TEXT.taken } };
  }

  try {
    await systemPrisma.aeliProfile.create({
      data: {
        userId: user.id,
        handle,
        // Der Community-Name als Startwert: wer die Seite von hier aus anlegt,
        // baut sie fast immer für genau diese Community.
        displayName: tenant.name,
        avatarUrl: tenant.logoUrl,
        linkedTenantId: tenant.id,
        theme: { preset: "mitternacht" },
        blocks: {
          create: [
            {
              type: "COMMUNITY_CTA",
              title: "Community beitreten",
              subtitle: tenant.tagline,
              sortOrder: 0,
            },
          ],
        },
      },
    });
  } catch (e) {
    // Der Unique-Index entscheidet, nicht die Prüfung oben: zwischen beiden
    // liegt Zeit, in der jemand anderes zugreifen kann.
    if ((e as { code?: string }).code === "P2002") {
      return { fieldErrors: { handle: "Der war eine Sekunde schneller weg." } };
    }
    throw e;
  }

  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "aeli.page_created",
    targetType: "AeliProfile",
    targetId: handle,
  });
  revalidatePath(settingsPath(slug));
  return { notice: `${handle} gehört dir. Die Community ist bereits verknüpft.` };
}

/** Verknüpft die bestehende Aeli-Seite dieses Kontos mit dieser Community. */
export async function linkAeliPageAction(form: FormData): Promise<void> {
  const slug = String(form.get("tenant") ?? "");
  const { tenant, user } = await requireTenantAdmin(slug, "OWNER");

  const updated = await systemPrisma.aeliProfile.updateMany({
    where: { userId: user.id },
    data: { linkedTenantId: tenant.id },
  });
  if (updated.count > 0) {
    await writeAudit({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "aeli.linked",
      targetType: "AeliProfile",
      targetId: user.id,
    });
  }
  revalidatePath(settingsPath(slug));
}

/**
 * Löst eine Verknüpfung — die eigene oder die einer fremden Seite.
 *
 * Beides gehört dem Community-Besitzer: eine fremde Bio-Seite darf auf seine
 * Community zeigen, solange er das erlaubt, und keine Minute länger.
 */
export async function unlinkAeliPageAction(form: FormData): Promise<void> {
  const slug = String(form.get("tenant") ?? "");
  const profileId = String(form.get("profileId") ?? "");
  const { tenant, user } = await requireTenantAdmin(slug, "OWNER");

  // `updateMany` mit `linkedTenantId` in der Bedingung: so kann diese Aktion
  // ausschließlich Zeiger auf die EIGENE Community lösen, nie einen fremden.
  const updated = await systemPrisma.aeliProfile.updateMany({
    where: { id: profileId, linkedTenantId: tenant.id },
    data: { linkedTenantId: null },
  });
  if (updated.count > 0) {
    await writeAudit({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "aeli.unlinked",
      targetType: "AeliProfile",
      targetId: profileId,
    });
  }
  revalidatePath(settingsPath(slug));
}

/**
 * Stellt einen Verbindungscode für ein fremdes Aeli-Konto aus.
 *
 * Der Code wird nicht gespeichert — er trägt Community und Ablaufzeit selbst
 * und ist mit `AELI_LINK_SECRET` signiert (lib/aeli-link-code.ts). Eingelöst
 * wird er drüben im Aeli-Studio.
 */
export async function issueAeliLinkCodeAction(
  _prev: AeliFormState,
  form: FormData,
): Promise<AeliFormState> {
  const slug = String(form.get("tenant") ?? "");
  const { tenant, user } = await requireTenantAdmin(slug, "OWNER");

  if (!linkCodesConfigured()) {
    return {
      error:
        "Verbindungscodes sind nicht eingerichtet — es fehlt AELI_LINK_SECRET in beiden Apps.",
    };
  }

  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "aeli.link_code_issued",
    targetType: "Tenant",
    targetId: tenant.id,
  });
  return { code: issueLinkCode(tenant.id) };
}

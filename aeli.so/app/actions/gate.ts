"use server";

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import prisma, { systemPrisma, withAeliTransaction } from "@/lib/prisma";
import { unlock } from "@/lib/gate";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { text, type FormState } from "@/lib/action-state";
import { publicLocale } from "@/lib/i18n";
import { PUBLIC_STRINGS } from "@/lib/public-strings";

/**
 * Entsperren einer geschützten Seite.
 *
 * Die Action läuft ohne Anmeldung — sie gehört einem Besucher, nicht einem
 * Konto. Deshalb prüft sie alles selbst: dass das Profil veröffentlicht ist
 * (über die RLS-Rolle), dass die Schranke wirklich die behauptete ist, und wie
 * oft von dieser Herkunft schon geraten wurde.
 */
export async function unlockAction(_prev: FormState, form: FormData): Promise<FormState> {
  const strings = PUBLIC_STRINGS[await publicLocale()];
  const profileId = text(form, "profileId", 40);
  const answer = text(form, "answer", 320);

  if (!rateLimit(`gate:${clientIp(await headers())}:${profileId}`, 15, 10 * 60_000).ok) {
    return { error: strings.genericError };
  }

  // Über die öffentliche Rolle: sieht das Profil nur, wenn es veröffentlicht
  // ist. Ein Entwurf lässt sich also nicht durch Raten der ID entsperren.
  const profile = await prisma.aeliProfile.findUnique({
    where: { id: profileId },
    select: { id: true, gate: true },
  });
  if (!profile || profile.gate === "NONE") return { error: strings.genericError };

  switch (profile.gate) {
    case "AGE":
      // Eine Selbstauskunft, mehr kann sie nicht sein. Der Wert liegt darin,
      // dass niemand versehentlich hineinstolpert.
      break;

    case "PASSWORD": {
      // `gatePasswordHash` liest die öffentliche Rolle bewusst nicht mit; der
      // Vergleich braucht ihn aber. Deshalb hier ein einzelner privilegierter
      // Griff auf genau dieses eine Feld.
      const secret = await systemPrisma.aeliProfile.findUnique({
        where: { id: profile.id },
        select: { gatePasswordHash: true },
      });
      if (!secret?.gatePasswordHash) return { error: strings.genericError };
      if (!(await bcrypt.compare(answer, secret.gatePasswordHash))) {
        return { error: strings.gateWrong };
      }
      break;
    }

    case "EMAIL": {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(answer)) {
        return { error: strings.invalidEmail };
      }
      // Rohes INSERT wie in api/lead: die öffentliche Rolle darf `AeliLead`
      // beschreiben, aber nicht lesen — Prismas `create` würde am angehängten
      // RETURNING scheitern.
      await withAeliTransaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO "AeliLead" ("id", "profileId", "source", "email")
          VALUES (${randomUUID()}, ${profile.id}, 'GATE', ${answer.toLowerCase()})
        `;
      });
      break;
    }
  }

  await unlock(profile.id, profile.gate);
  return {};
}

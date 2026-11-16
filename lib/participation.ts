import "server-only";
import { canAccess, canParticipate, type AccessContext, type Gated } from "./entitlements";
import { isLessonUnlocked } from "./drip";
import prisma from "./prisma";

/**
 * Schreibende Teilnahme an Events und Kursen (RSVP, Lektion abschließen).
 *
 * Beides vergibt Punkte, deshalb gilt dieselbe Regel wie bei Beiträgen und
 * Kommentaren: Lesezugriff auf den Space (`canAccess`) UND eine aktive
 * Mitgliedschaft (`canParticipate`). Dazu kommt die Sperre des einzelnen
 * Events bzw. Kurses über `requiredEntitlementKey` — sonst ließen sich mit
 * einer kostenlosen Mitgliedschaft Punkte auf bezahlten Lektionen sammeln.
 * Web-Action und Mobile-API rufen dieselben Funktionen auf.
 */

export interface ParticipationEvent {
  requiredEntitlementKey: string | null;
  space: Gated;
}

export function canRsvpEvent(event: ParticipationEvent, ctx: AccessContext): boolean {
  if (!canParticipate(ctx) || !canAccess(event.space, ctx)) return false;
  if (ctx.isStaff || !event.requiredEntitlementKey) return true;
  return ctx.keys.has(event.requiredEntitlementKey);
}

export interface ParticipationLesson {
  isPreview: boolean;
  dripAfterDays: number | null;
  course: {
    isPublished: boolean;
    requiredEntitlementKey: string | null;
    space: Gated;
  };
}

/**
 * Spiegelt die Freischaltung der Kursansicht (lib/mobile/serializers#courseDtos):
 * Kurs zugänglich oder Vorschau-Lektion, und der Drip-Termin ist erreicht.
 * Staff ist überall ausgenommen.
 */
export function canCompleteLesson(lesson: ParticipationLesson, ctx: AccessContext): boolean {
  if (!canParticipate(ctx) || !canAccess(lesson.course.space, ctx)) return false;
  if (ctx.isStaff) return true;
  if (!lesson.course.isPublished) return false;
  const courseOpen =
    !lesson.course.requiredEntitlementKey ||
    ctx.keys.has(lesson.course.requiredEntitlementKey);
  if (!courseOpen && !lesson.isPreview) return false;
  return isLessonUnlocked(ctx.membership?.joinedAt ?? null, lesson.dripAfterDays);
}

/**
 * Ist das Event ausgebucht? `capacity` null heisst unbegrenzt. Zaehlt nur
 * Zusagen; die Eindeutigkeit (eventId, userId) verhindert Doppelbuchungen,
 * ein knappes Ueberbuchen bei gleichzeitigen Zusagen bleibt moeglich.
 */
export async function eventIsFull(event: { id: string; capacity: number | null }): Promise<boolean> {
  if (event.capacity == null || event.capacity <= 0) return false;
  const going = await prisma.eventRsvp.count({ where: { eventId: event.id, status: "GOING" } });
  return going >= event.capacity;
}

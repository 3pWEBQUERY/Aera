import prisma from "@/lib/prisma";
import { awardPoints } from "@/lib/gamification";
import { buildAccessContext, canParticipate } from "@/lib/entitlements";
import { canCompleteLesson } from "@/lib/participation";
import { jsonError, jsonOk, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";

// POST /api/mobile/v1/c/{slug}/lessons/{lessonId}/complete
// → { completed: true, progress: { completed, total } }
// Logik gespiegelt aus completeLessonAction (app/actions/engage.ts) inkl.
// Space-/Kurs-Paywall und Drip-Gate (lib/participation, Staff ausgenommen).

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; lessonId: string }> },
) {
  const { slug, lessonId } = await params;
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;
  const user = auth.user;

  const tenant = await resolveTenant(slug);
  if (!tenant) return jsonError("not_found", "Community not found.", 404);

  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, tenantId: tenant.id },
    include: { course: { include: { space: true } } },
  });
  if (!lesson) return jsonError("not_found", "Lesson not found.", 404);

  const ctx = await buildAccessContext(tenant.id, user.id);
  if (!canParticipate(ctx)) {
    return jsonError("not_member", "Active membership required.", 403);
  }
  // Space-Zugriff, Kurs-Paywall und Drip — dieselbe Regel wie im Web.
  if (!canCompleteLesson(lesson, ctx)) {
    return jsonError("payment_required", "This lesson is not unlocked for you.", 403);
  }

  const existing = await prisma.lessonProgress.findUnique({
    where: { lessonId_userId: { lessonId, userId: user.id } },
  });
  if (!existing) {
    await prisma.lessonProgress.create({
      data: { tenantId: tenant.id, lessonId, userId: user.id },
    });
    await awardPoints({
      tenantId: tenant.id,
      userId: user.id,
      trigger: "LESSON_COMPLETED",
      refType: "Lesson",
      refId: lessonId,
    });
  }

  // Kurs-Fortschritt nach dem Abschluss.
  const lessonIds = (
    await prisma.lesson.findMany({
      where: { tenantId: tenant.id, courseId: lesson.courseId },
      select: { id: true },
    })
  ).map((l) => l.id);
  const completed = await prisma.lessonProgress.count({
    where: { tenantId: tenant.id, userId: user.id, lessonId: { in: lessonIds } },
  });
  return jsonOk({
    completed: true,
    progress: { completed, total: lessonIds.length },
  });
}

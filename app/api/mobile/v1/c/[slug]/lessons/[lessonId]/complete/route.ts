import prisma from "@/lib/prisma";
import { awardPoints } from "@/lib/gamification";
import { isLessonUnlocked } from "@/lib/drip";
import { roleAtLeast } from "@/lib/tenant";
import { jsonError, jsonOk, requireMobileAuth, resolveTenant } from "@/lib/mobile/api";

// POST /api/mobile/v1/c/{slug}/lessons/{lessonId}/complete
// → { completed: true, progress: { completed, total } }
// Logik gespiegelt aus completeLessonAction (app/actions/engage.ts) inkl.
// serverseitigem Drip-Gate (Staff ausgenommen).

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
  });
  if (!lesson) return jsonError("not_found", "Lesson not found.", 404);

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (membership?.status !== "ACTIVE") {
    return jsonError("not_member", "Active membership required.", 403);
  }
  const isStaff = roleAtLeast(membership.role, "MODERATOR");

  // Drip-Content serverseitig durchsetzen (Staff ausgenommen).
  if (lesson.dripAfterDays && lesson.dripAfterDays > 0) {
    if (!isStaff && !isLessonUnlocked(membership.joinedAt, lesson.dripAfterDays)) {
      return jsonError("payment_required", "This lesson is not unlocked yet.", 403);
    }
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

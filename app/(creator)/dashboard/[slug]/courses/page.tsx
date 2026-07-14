import { requireTenantAdmin } from "@/lib/guards";
import prisma from "@/lib/prisma";
import {
  CoursesManager,
  type CourseRowData,
} from "@/components/dashboard/courses-manager";

export default async function CoursesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenantAdmin(slug);
  const rows = await prisma.course.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    include: { lessons: { orderBy: { sortOrder: "asc" } } },
  });

  const courses: CourseRowData[] = rows.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    coverUrl: c.coverUrl,
    isPublished: c.isPublished,
    format: c.format,
    videoUrl: c.videoUrl,
    streamUrl: c.streamUrl,
    location: c.location,
    address: c.address,
    startsAt: c.startsAt,
    capacity: c.capacity,
    lessons: c.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      content: l.content,
      videoUrl: l.videoUrl,
      dripAfterDays: l.dripAfterDays,
    })),
  }));

  return <CoursesManager slug={slug} courses={courses} />;
}

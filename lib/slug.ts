import "server-only";
import prisma from "./prisma";
import { slugify } from "./utils";

type SlugModel =
  | "space"
  | "product"
  | "course"
  | "event"
  | "knowledgeArticle"
  | "mediaPackage";

/** Generate a tenant-unique slug for a child entity. */
export async function uniqueChildSlug(
  model: SlugModel,
  tenantId: string,
  base: string,
): Promise<string> {
  const root = slugify(base);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    // @ts-expect-error dynamic model access is intentional & type-narrowed by SlugModel
    const found = await prisma[model].findFirst({
      where: { tenantId, slug: candidate },
      select: { id: true },
    });
    if (!found) return candidate;
  }
  return `${root}-${Date.now()}`;
}

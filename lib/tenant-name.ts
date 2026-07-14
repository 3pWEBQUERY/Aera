import "server-only";
import prisma from "./prisma";

export type NameStatus = "available" | "taken" | "short" | "long";

/** Collapse whitespace so " My  Studio " and "My Studio" compare equal. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Availability of a community name. Case-insensitive; a tenant can keep its own
 * name (pass `excludeSlug`). Used by the live check API and the write actions.
 */
export async function nameStatus(name: string, excludeSlug?: string): Promise<NameStatus> {
  const n = normalizeName(name);
  if (n.length < 2) return "short";
  if (n.length > 60) return "long";
  const found = await prisma.tenant.findFirst({
    where: {
      name: { equals: n, mode: "insensitive" },
      ...(excludeSlug ? { NOT: { slug: excludeSlug } } : {}),
    },
    select: { id: true },
  });
  return found ? "taken" : "available";
}

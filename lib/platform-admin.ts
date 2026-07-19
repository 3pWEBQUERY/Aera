import "server-only";
import { env } from "./env";
import type { PlatformRole } from "@/app/generated/prisma/client";

export interface PlatformAdminCandidate {
  email: string;
  emailVerifiedAt: Date | null;
  totpSecret: string | null;
  totpEnabledAt: Date | null;
  platformRole: PlatformRole;
}

/**
 * A platform admin is authorized by durable database state and must have both
 * mailbox verification and TOTP enabled. PLATFORM_ADMIN_EMAILS is optional:
 * when configured it narrows the DB admins further, but can never grant access.
 */
export function hasPlatformAdminAccess(
  user: PlatformAdminCandidate | null | undefined,
  emailAllowlist: readonly string[] = env.PLATFORM_ADMIN_EMAILS,
): boolean {
  if (
    !user ||
    user.platformRole !== "ADMIN" ||
    !user.emailVerifiedAt ||
    !user.totpEnabledAt ||
    !user.totpSecret
  ) {
    return false;
  }

  if (emailAllowlist.length === 0) return true;
  return emailAllowlist.includes(user.email.trim().toLowerCase());
}

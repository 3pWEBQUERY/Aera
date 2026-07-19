import "server-only";
import { systemPrisma as prisma } from "./prisma";
import { randomUUID } from "node:crypto";

export async function writeAudit(input: {
  tenantId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const metadata = JSON.stringify(input.metadata ?? {});
    // Audit writes intentionally use the privileged client. aera_app has no
    // EXECUTE grant on the SECURITY DEFINER function, so tenant-scoped SQL can
    // neither forge platform events nor impersonate another actor.
    await prisma.$queryRaw`
      SELECT aera_write_audit(
        ${randomUUID()},
        ${input.tenantId ?? null},
        ${input.actorUserId ?? null},
        ${input.action},
        ${input.targetType ?? null},
        ${input.targetId ?? null},
        CAST(${metadata} AS JSONB)
      )
    `;
  } catch (error) {
    console.error(`Audit write failed (${input.action}):`, error);
  }
}

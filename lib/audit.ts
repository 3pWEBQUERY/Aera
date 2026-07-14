import "server-only";
import prisma from "./prisma";
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

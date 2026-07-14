import "server-only";
import prisma from "./prisma";
import { getOrCreateWallet } from "./credits";
import { PLANS, type PlanKey } from "./credit-plans";

const GB = 1024 * 1024 * 1024;

export interface StorageStatus {
  plan: PlanKey;
  usedBytes: number;
  limitBytes: number;
}

export function storageLimitBytes(plan: PlanKey): number {
  return (PLANS[plan]?.storageGb ?? PLANS.FREE.storageGb) * GB;
}

/**
 * Current bucket usage vs. plan quota for a tenant. Usage is the sum of all
 * StorageObject sizes — the same rows the media library shows, so the number
 * on screen and the enforced limit can't drift apart.
 */
export async function tenantStorage(tenantId: string): Promise<StorageStatus> {
  const [wallet, agg] = await Promise.all([
    getOrCreateWallet(tenantId),
    prisma.storageObject.aggregate({
      where: { tenantId },
      _sum: { sizeBytes: true },
    }),
  ]);
  const plan = wallet.plan as PlanKey;
  return {
    plan,
    usedBytes: agg._sum.sizeBytes ?? 0,
    limitBytes: storageLimitBytes(plan),
  };
}

/** Whether `addBytes` more still fit into the tenant's plan quota. */
export async function storageAllows(
  tenantId: string,
  addBytes: number,
): Promise<{ ok: boolean } & StorageStatus> {
  const status = await tenantStorage(tenantId);
  return { ok: status.usedBytes + addBytes <= status.limitBytes, ...status };
}

/** "12,4 GB" / "512 MB" — for quota error messages and meters. */
export function formatStorage(bytes: number, locale = "de"): string {
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (bytes >= GB) return `${nf.format(bytes / GB)} GB`;
  if (bytes >= 1024 * 1024) return `${nf.format(bytes / (1024 * 1024))} MB`;
  return `${nf.format(Math.ceil(bytes / 1024))} KB`;
}

"use server";

import { requireTenantAdmin } from "@/lib/guards";
import { env } from "@/lib/env";
import { getTranslations } from "next-intl/server";

export interface TestResult {
  ok?: boolean;
  message?: string;
}

/**
 * Live check: actually calls Stripe's API with the configured secret key and
 * reports whether the connection works — not just whether a key is present.
 */
export async function testStripeAction(_prev: TestResult, fd: FormData): Promise<TestResult> {
  const slug = String(fd.get("tenant"));
  await requireTenantAdmin(slug); // only staff may probe the key
  const t = await getTranslations("dashboard.settings.stripeTest");

  const key = env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, message: t("noSecretKey") };

  try {
    const res = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { livemode?: boolean };
      return {
        ok: true,
        message: t("success", { mode: data.livemode ? t("modeLive") : t("modeTest") }),
      };
    }
    if (res.status === 401) {
      return { ok: false, message: t("invalidKey") };
    }
    return { ok: false, message: t("httpError", { status: res.status }) };
  } catch {
    return { ok: false, message: t("networkError") };
  }
}

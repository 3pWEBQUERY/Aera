import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";

// Alte Adresse, leitet ins Konto weiter: nie indexieren.
export const metadata: Metadata = { robots: NOINDEX };

/** The member account moved to the global /member/account route. */
export default async function LegacyAccountRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const qs = new URLSearchParams({
    from: `/c/${slug}`,
    ...(tab ? { tab } : {}),
  });
  redirect(`/member/account?${qs.toString()}`);
}

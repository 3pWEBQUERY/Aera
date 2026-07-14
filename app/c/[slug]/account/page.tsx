import { redirect } from "next/navigation";

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

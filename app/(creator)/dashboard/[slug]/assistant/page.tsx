import { requireTenantAdmin } from "@/lib/guards";
import { features } from "@/lib/env";
import { AssistantWorkspace } from "@/components/dashboard/assistant-workspace";
import { hasPlatformAdminAccess } from "@/lib/platform-admin";

export default async function AssistantPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ billing?: string }>;
}) {
  const { slug } = await params;
  const { billing } = await searchParams;
  const { user } = await requireTenantAdmin(slug);
  const returnedFromBilling =
    billing === "success" ||
    billing === "canceled" ||
    billing === "checkout-error";

  return (
    <AssistantWorkspace
      slug={slug}
      geminiOn={features.gemini}
      isPlatformAdmin={hasPlatformAdminAccess(user)}
      user={{ name: user.name, avatarUrl: user.avatarUrl }}
      initialCreditsOpen={returnedFromBilling}
      initialCheckoutError={billing === "checkout-error"}
    />
  );
}

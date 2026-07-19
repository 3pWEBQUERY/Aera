import { requireTenantAdmin } from "@/lib/guards";
import { features } from "@/lib/env";
import { AssistantWorkspace } from "@/components/dashboard/assistant-workspace";

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
      user={{ name: user.name, avatarUrl: user.avatarUrl }}
      initialCreditsOpen={returnedFromBilling}
      initialCheckoutError={billing === "checkout-error"}
    />
  );
}

import { requireTenantAdmin } from "@/lib/guards";
import { features } from "@/lib/env";
import { AssistantWorkspace } from "@/components/dashboard/assistant-workspace";

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await requireTenantAdmin(slug);

  return (
    <AssistantWorkspace
      slug={slug}
      geminiOn={features.gemini}
      user={{ name: user.name, avatarUrl: user.avatarUrl }}
    />
  );
}

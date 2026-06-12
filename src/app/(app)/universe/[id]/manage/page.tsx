import { UniverseAIManagementClient } from "./ai-management-client";

export const dynamic = "force-dynamic";

interface ManagePageProps {
  params: Promise<{ id: string }>;
}

export default async function UniverseAIManagePage({ params }: ManagePageProps) {
  const { id } = await params;
  return <UniverseAIManagementClient universeId={id} />;
}

import { notFound } from "next/navigation";
import { ProjectAnalysisPage } from "@/components/product-guide/project-analysis-page";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getProjectAnalysisData } from "@/lib/project-analysis-repository";

export const dynamic = "force-dynamic";

export default async function ProductGuideProjectAnalysisRoute({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const currentUser = await requireCurrentUser(`/product-guide/project-analysis/${projectId}`);

  const data = await getProjectAnalysisData(projectId);
  if (!data) {
    notFound();
  }

  return <ProjectAnalysisPage currentUser={currentUser} data={data} />;
}

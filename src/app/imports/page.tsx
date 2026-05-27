import { ImportPreviewWorkbench } from "@/components/imports/import-preview-workbench";
import { requireCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

type ImportType = "project-main" | "modeling";

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ importType?: string; type?: string }>;
}) {
  const currentUser = await requireCurrentUser("/imports");
  const params = await searchParams;
  const initialImportType: ImportType = params.importType === "modeling" || params.type === "modeling" ? "modeling" : "project-main";

  return <ImportPreviewWorkbench currentUser={currentUser} initialImportType={initialImportType} />;
}

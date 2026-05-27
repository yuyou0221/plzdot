import { ImportPreviewWorkbench } from "@/components/imports/import-preview-workbench";
import { requireCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const currentUser = await requireCurrentUser("/imports");

  return <ImportPreviewWorkbench currentUser={{ name: currentUser.name, authRole: currentUser.authRole }} />;
}

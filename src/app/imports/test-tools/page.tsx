import { ScheduleTestImportWorkbench } from "@/components/imports/schedule-test-import-workbench";
import { AccessDeniedPanel } from "@/components/layout/access-denied-panel";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { canAccessInternalTestTools } from "@/lib/runtime-flags";

export const dynamic = "force-dynamic";

export default async function ImportTestToolsPage() {
  const currentUser = await requireCurrentUser("/imports/test-tools");

  if (!canAccessInternalTestTools(currentUser)) {
    return <AccessDeniedPanel />;
  }

  return <ScheduleTestImportWorkbench currentUser={currentUser} />;
}

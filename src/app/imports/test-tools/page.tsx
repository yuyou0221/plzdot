import { ScheduleTestImportWorkbench } from "@/components/imports/schedule-test-import-workbench";
import { requireCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function ImportTestToolsPage() {
  const currentUser = await requireCurrentUser("/imports/test-tools");

  return <ScheduleTestImportWorkbench currentUser={currentUser} />;
}

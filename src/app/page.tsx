import { ScheduleWorkbench } from "@/components/schedule/schedule-workbench";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getScheduleWorkbenchData } from "@/lib/schedule-repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const currentUser = await requireCurrentUser("/");
  const data = await getScheduleWorkbenchData();

  return <ScheduleWorkbench currentUser={currentUser} data={data} />;
}

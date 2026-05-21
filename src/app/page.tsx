import { ScheduleWorkbench } from "@/components/schedule/schedule-workbench";
import { getScheduleWorkbenchData } from "@/lib/schedule-repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getScheduleWorkbenchData();

  return <ScheduleWorkbench data={data} />;
}

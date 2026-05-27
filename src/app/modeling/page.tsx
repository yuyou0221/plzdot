import { ModelingScheduleBoard } from "@/components/modeling/modeling-schedule-board";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getModelingScheduleData } from "@/lib/modeling-schedule-repository";

export const dynamic = "force-dynamic";

export default async function ModelingPage() {
  const currentUser = await requireCurrentUser("/modeling");
  const data = await getModelingScheduleData();

  return <ModelingScheduleBoard currentUser={currentUser} data={data} />;
}

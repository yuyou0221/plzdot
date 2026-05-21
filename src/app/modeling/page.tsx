import { ModelingScheduleBoard } from "@/components/modeling/modeling-schedule-board";
import { getModelingScheduleData } from "@/lib/modeling-schedule-repository";

export const dynamic = "force-dynamic";

export default async function ModelingPage() {
  const data = await getModelingScheduleData();

  return <ModelingScheduleBoard data={data} />;
}

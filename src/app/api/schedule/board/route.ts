import { NextResponse } from "next/server";
import { getScheduleWorkbenchData } from "@/lib/schedule-repository";

export async function GET() {
  const data = await getScheduleWorkbenchData();
  return NextResponse.json(data);
}

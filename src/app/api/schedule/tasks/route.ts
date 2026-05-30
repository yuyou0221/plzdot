import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { getScheduleTaskRows } from "@/lib/schedule-repository";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const tasks = await getScheduleTaskRows();
  return NextResponse.json({ tasks });
}

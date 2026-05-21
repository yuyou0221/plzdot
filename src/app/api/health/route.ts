import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@/lib/schedule-repository";

export async function GET() {
  const database = await checkDatabaseConnection();

  return NextResponse.json({
    ok: true,
    database,
  });
}

import { requireApiRole } from "@/lib/auth/api";
import { userDataExcelOnlyResponse } from "@/lib/user-data-excel-only";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  return userDataExcelOnlyResponse();
}

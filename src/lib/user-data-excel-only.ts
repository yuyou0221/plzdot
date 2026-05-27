import { NextResponse } from "next/server";

export function userDataExcelOnlyResponse() {
  return NextResponse.json(
    {
      ok: false,
      message: "用户数据只能通过 Excel 覆盖导入更新，页面手动新增和编辑已关闭。",
    },
    { status: 405 },
  );
}

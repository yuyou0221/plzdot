import { NextResponse } from "next/server";
import { requireApiUserDataLevelZero } from "@/lib/auth/api";
import { previewUserDataWorkbook, UserDataImportValidationError } from "@/lib/user-data-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiUserDataLevelZero();
  if ("response" in auth) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "请先选择用户数据 Excel 文件。" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ ok: false, message: "当前只支持 .xlsx 格式。" }, { status: 400 });
    }

    const preview = await previewUserDataWorkbook({
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
    });

    return NextResponse.json({
      ok: true,
      message: preview.canApply ? "安全测试预览通过，可以覆盖更新。" : "安全测试预览发现问题，请先处理后再覆盖更新。",
      preview,
    });
  } catch (error) {
    const isValidationError = error instanceof UserDataImportValidationError;

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && error.message
            ? `用户数据预览失败：${error.message}`
            : "用户数据预览失败。",
      },
      { status: isValidationError ? 400 : 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import {
  importActualSchedulePayloadContent,
  previewActualSchedulePayloadContent,
} from "@/lib/schedule-import/actual-schedule-import";

export const runtime = "nodejs";

const confirmationText = "确认全量替换测试数据";

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;

  try {
    const formData = await request.formData();
    const action = optionalText(formData.get("action")) ?? "preview";
    const confirmation = optionalText(formData.get("confirmation"));
    const payloadFile = await resolvePayloadFile(formData);

    if (action !== "preview" && action !== "apply") {
      return NextResponse.json({ ok: false, message: "无法识别测试导入动作。" }, { status: 400 });
    }

    if (!payloadFile) {
      return NextResponse.json({ ok: false, message: "请上传旧排期 JSON 文件。" }, { status: 400 });
    }

    const preview = await previewActualSchedulePayloadContent(payloadFile.payload, {
      sourceFileName: payloadFile.fileName,
    });

    if (action === "preview") {
      return NextResponse.json({
        ok: true,
        message: "测试导入预览已生成，尚未写入数据库。",
        preview,
        confirmationText,
      });
    }

    if (confirmation !== confirmationText) {
      return NextResponse.json(
        {
          ok: false,
          message: `确认短语不正确。请输入：${confirmationText}`,
          preview,
          confirmationText,
        },
        { status: 400 },
      );
    }

    const result = await importActualSchedulePayloadContent(payloadFile.payload, {
      sourceFileName: payloadFile.fileName,
    });

    return NextResponse.json({
      ok: true,
      message: `测试数据全量替换完成：导入 ${result.projects} 个项目、${result.projectTasks} 条任务、${result.futureTasks} 条未来任务。`,
      result,
      preview,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `测试导入失败：${error.message}` : "测试导入失败。",
      },
      { status: 500 },
    );
  }
}

async function resolvePayloadFile(formData: FormData) {
  const file = formData.get("file");

  if (file instanceof File) {
    if (!file.name.toLowerCase().endsWith(".json")) {
      throw new Error("测试导入只支持旧排期 JSON 文件。");
    }

    return {
      fileName: sanitizeFileName(file.name),
      payload: JSON.parse(await file.text()),
    };
  }

  return null;
}

function optionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text.length > 0 ? text : null;
}

function sanitizeFileName(value: string) {
  const basename = value.split(/[\\/]/).filter(Boolean).at(-1)?.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  return basename || "actual-schedule.json";
}

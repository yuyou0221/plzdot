import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";
import { importActualSchedulePayload } from "@/lib/schedule-import/actual-schedule-import";

export const runtime = "nodejs";

type CommandResult = {
  stdout: string;
  stderr: string;
};

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const today = optionalText(formData.get("today")) ?? shanghaiToday();

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "请先选择一份 Excel 文件。" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ ok: false, message: "当前只支持 .xlsx 格式。" }, { status: 400 });
    }

    const importDir = path.join(process.cwd(), ".local", "schedule-imports", timestampId());
    await fs.mkdir(importDir, { recursive: true });

    const workbookPath = path.join(importDir, sanitizeFileName(file.name));
    await fs.writeFile(workbookPath, Buffer.from(await file.arrayBuffer()));

    const analysisSummary = await runScheduleExcelAnalysis(workbookPath, importDir, today);
    const jsonPath = path.join(importDir, "project-task-estimates-v5.json");
    const importResult = await importActualSchedulePayload(jsonPath);

    return NextResponse.json({
      message: `Excel 已导入并完成测算：${importResult.projects} 个项目，${importResult.projectTasks} 条任务，${importResult.futureTasks} 条未来任务。`,
      ...importResult,
      analysisSummary,
      outputDir: importDir,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `Excel 导入失败：${error.message}` : "Excel 导入失败。",
      },
      { status: 500 },
    );
  }
}

async function runScheduleExcelAnalysis(workbookPath: string, outDir: string, today: string) {
  const scriptPath = path.join(process.cwd(), "legacy", "schedule-engine", "project-analysis-v5-excel.cjs");
  const enginePath = path.join(process.cwd(), "legacy", "schedule-engine", "project-schedule-core.cjs");
  const python = process.env.SCHEDULE_IMPORT_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const result = await runCommand(process.execPath, [
    scriptPath,
    "--excel",
    workbookPath,
    "--engine",
    enginePath,
    "--python",
    python,
    "--out",
    outDir,
    "--today",
    today,
    "--skip-xlsx-export",
  ]);

  const summary = parseLastJsonObject(result.stdout);
  if (!summary) {
    return {
      stdout: result.stdout.slice(-2000),
      stderr: result.stderr.slice(-2000),
    };
  }

  return summary;
}

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
      },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error([stderr.trim(), stdout.trim()].filter(Boolean).join("\n") || `命令退出码 ${code}`));
    });
  });
}

function parseLastJsonObject(text: string) {
  const start = text.lastIndexOf("{");
  const end = text.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function optionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text.length > 0 ? text : null;
}

function sanitizeFileName(value: string) {
  const basename = path.basename(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  return basename || "schedule-import.xlsx";
}

function timestampId() {
  return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
}

function shanghaiToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

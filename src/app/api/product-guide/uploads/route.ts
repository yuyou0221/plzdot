import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";

export const runtime = "nodejs";

const maxFileSize = 8 * 1024 * 1024;
const allowedFileTypes = new Map([
  ["image/jpeg", { extension: ".jpg", type: "图片" }],
  ["image/png", { extension: ".png", type: "图片" }],
  ["image/webp", { extension: ".webp", type: "图片" }],
  ["image/gif", { extension: ".gif", type: "图片" }],
  ["application/pdf", { extension: ".pdf", type: "PDF" }],
  ["application/vnd.ms-powerpoint", { extension: ".ppt", type: "PPT" }],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", { extension: ".pptx", type: "PPT" }],
]);

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((file): file is File => file instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ ok: false, message: "请先选择文件。" }, { status: 400 });
    }

    if (files.length > 10) {
      return NextResponse.json({ ok: false, message: "一次最多上传 10 个文件。" }, { status: 400 });
    }

    const monthDir = currentMonthDir();
    const targetDir = path.join(process.cwd(), "public", "uploads", "product-guide", monthDir);
    await mkdir(targetDir, { recursive: true });

    const uploadedFiles = [];

    for (const file of files) {
      const fileType = allowedFileTypes.get(file.type);
      if (!fileType) {
        return NextResponse.json({ ok: false, message: "仅支持 JPG、PNG、WebP、GIF、PDF、PPT、PPTX 文件。" }, { status: 400 });
      }

      if (file.size > maxFileSize) {
        return NextResponse.json({ ok: false, message: "单个文件不能超过 8MB。" }, { status: 400 });
      }

      const fileName = `${randomUUID()}${fileType.extension}`;
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(targetDir, fileName), bytes);

      uploadedFiles.push({
        name: sanitizeDisplayName(file.name),
        url: `/uploads/product-guide/${monthDir}/${fileName}`,
        type: fileType.type,
      });
    }

    return NextResponse.json({ ok: true, files: uploadedFiles });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `上传文件失败：${error.message}` : "上传文件失败。",
      },
      { status: 500 },
    );
  }
}

function currentMonthDir() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function sanitizeDisplayName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120) || "产品组附件";
}

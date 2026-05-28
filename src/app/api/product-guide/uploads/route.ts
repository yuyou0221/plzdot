import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api";

export const runtime = "nodejs";

const maxFileSize = 8 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  const auth = await requireApiRole(["admin", "manager"]);
  if ("response" in auth) return auth.response;

  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((file): file is File => file instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ ok: false, message: "请先选择图片。" }, { status: 400 });
    }

    if (files.length > 10) {
      return NextResponse.json({ ok: false, message: "一次最多上传 10 张图片。" }, { status: 400 });
    }

    const monthDir = currentMonthDir();
    const targetDir = path.join(process.cwd(), "public", "uploads", "product-guide", monthDir);
    await mkdir(targetDir, { recursive: true });

    const uploadedFiles = [];

    for (const file of files) {
      if (!allowedImageTypes.has(file.type)) {
        return NextResponse.json({ ok: false, message: "只支持 JPG、PNG、WebP、GIF 图片。" }, { status: 400 });
      }

      if (file.size > maxFileSize) {
        return NextResponse.json({ ok: false, message: "单张图片不能超过 8MB。" }, { status: 400 });
      }

      const extension = extensionForType(file.type);
      const fileName = `${randomUUID()}${extension}`;
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(targetDir, fileName), bytes);

      uploadedFiles.push({
        name: sanitizeDisplayName(file.name),
        url: `/uploads/product-guide/${monthDir}/${fileName}`,
        type: "原画图",
      });
    }

    return NextResponse.json({ ok: true, files: uploadedFiles });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error && error.message ? `上传图片失败：${error.message}` : "上传图片失败。",
      },
      { status: 500 },
    );
  }
}

function currentMonthDir() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function extensionForType(type: string) {
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  return ".jpg";
}

function sanitizeDisplayName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120) || "原画图";
}

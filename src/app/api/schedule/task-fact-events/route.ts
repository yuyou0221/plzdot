import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import {
  type ProjectTaskFactEvent,
  parseProjectTaskFactEvent,
  TaskFactEventValidationError,
} from "@/lib/schedule-task-fact-events";
import { ingestTaskFactEventAndRecalculate } from "@/lib/schedule-task-fact-events-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "请求内容不是有效 JSON" }, { status: 400 });
  }

  try {
    const event = parseProjectTaskFactEvent(eventInputFromPayload(payload));
    if (requiresPrivilegedTaskFactWrite(event) && auth.user.authRole !== "admin" && auth.user.authRole !== "manager") {
      return NextResponse.json({ ok: false, message: "强制、历史、Excel 类任务事实仅管理者可写。" }, { status: 403 });
    }

    const result = await ingestTaskFactEventAndRecalculate(event);

    if (!result.ok) {
      return NextResponse.json(result, { status: result.status ?? 422 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TaskFactEventValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error && error.message
            ? `项目排期接收任务事实事件失败：${error.message}`
            : "项目排期接收任务事实事件失败",
      },
      { status: 500 },
    );
  }
}

function requiresPrivilegedTaskFactWrite(event: ProjectTaskFactEvent) {
  if (event.sourceModule !== "product-guide") {
    return true;
  }

  const payload = event.payload ?? {};
  return Boolean(
    payload.force ||
      payload.forceComplete ||
      payload.overrideExistingFact ||
      payload.backfill ||
      payload.historyBackfill ||
      payload.bulk ||
      payload.importSource,
  );
}

function eventInputFromPayload(payload: unknown) {
  if (!isPlainObject(payload)) {
    return payload;
  }

  if (Array.isArray(payload.events)) {
    if (payload.events.length !== 1) {
      throw new TaskFactEventValidationError("当前接口一次只接收一条任务事实事件。");
    }

    return payload.events[0];
  }

  if ("event" in payload) {
    return payload.event;
  }

  return payload;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

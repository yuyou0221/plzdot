import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import {
  ingestProjectTaskFactEvent,
  parseProjectTaskFactEvent,
  TaskFactEventValidationError,
  type ProjectTaskFactEvent,
} from "@/lib/schedule-task-fact-events";

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

    if (isOverrideEvent(event) && !canUseTaskOverride(auth.user.authRole)) {
      return NextResponse.json({ ok: false, message: "当前账号没有管理层强制处理权限。" }, { status: 403 });
    }

    const result = await ingestProjectTaskFactEvent(event);

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

function isOverrideEvent(event: ProjectTaskFactEvent) {
  return isPlainObject(event.payload) && event.payload.override === true;
}

function canUseTaskOverride(authRole: string) {
  return authRole === "admin" || authRole === "manager";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

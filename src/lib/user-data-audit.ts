import "server-only";

import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

const sensitiveKeyPattern = /password|passwd|pwd|hash|cipher|secret|token|cookie|authorization|明文|密码/i;

export type UserDataAuditResult = "成功" | "失败" | "拒绝";
type UserDataAuditClient = {
  userDataAuditLog: {
    create: (args: Prisma.UserDataAuditLogCreateArgs) => Promise<unknown>;
  };
};

export class UserDataAuditWriteError extends Error {
  constructor() {
    super("用户数据审计记录写入失败，操作已中止，请稍后重试。");
    this.name = "UserDataAuditWriteError";
  }
}

export function isUserDataAuditWriteError(error: unknown): error is UserDataAuditWriteError {
  return error instanceof UserDataAuditWriteError;
}

export async function recordUserDataAuditLog({
  actor,
  request,
  action,
  targetType,
  targetId,
  result,
  summary,
  metadata,
  client,
  required = false,
}: {
  actor?: Pick<AuthUser, "id" | "name" | "loginName"> | null;
  request?: Request;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  result: UserDataAuditResult;
  summary?: string | null;
  metadata?: unknown;
  client?: UserDataAuditClient;
  required?: boolean;
}) {
  try {
    await (client ?? prisma).userDataAuditLog.create({
      data: {
        actorUserId: actor?.id ?? null,
        actorName: actor?.name ?? null,
        actorLoginName: actor?.loginName ?? null,
        action,
        targetType: targetType ?? null,
        targetId: targetId ?? null,
        result,
        summary: summary ? summary.slice(0, 500) : null,
        metadata: sanitizeAuditMetadata(metadata),
        ipAddress: request ? requestIp(request) : null,
        userAgent: request?.headers.get("user-agent")?.slice(0, 500) ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to record user data audit log", error);
    if (required) {
      throw new UserDataAuditWriteError();
    }
  }
}

function requestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwardedFor || request.headers.get("x-real-ip") || "").slice(0, 100) || null;
}

function sanitizeAuditMetadata(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return sanitizeValue(value, 0) as Prisma.InputJsonValue;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 4) {
    return "[已截断]";
  }

  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") {
    return value ?? null;
  }

  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      output[key] = sensitiveKeyPattern.test(key) ? "[已隐藏]" : sanitizeValue(item, depth + 1);
    }

    return output;
  }

  return String(value);
}

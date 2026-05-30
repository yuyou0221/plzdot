import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const modelingProductGuideEventTypes = ["style_list_confirmed", "style_list_returned", "modeling_work_submitted"] as const;

export type ModelingProductGuideEventType = (typeof modelingProductGuideEventTypes)[number];

type ProductGuideEventRow = {
  id: string;
  eventType: string;
  sourceModule: string;
  targetModule: string;
  projectId: string;
  projectTaskId: string | null;
  modelingTaskId: string | null;
  payload: Prisma.JsonValue;
  status: string;
  generatedBy: string | null;
  consumedAt: Date | null;
  createdAt: Date;
};

const productGuideEventSelect = {
  id: true,
  eventType: true,
  sourceModule: true,
  targetModule: true,
  projectId: true,
  projectTaskId: true,
  modelingTaskId: true,
  payload: true,
  status: true,
  generatedBy: true,
  consumedAt: true,
  createdAt: true,
} satisfies Prisma.ModelingProductGuideEventSelect;

export async function createModelingProductGuideEvent(
  tx: Prisma.TransactionClient,
  input: {
    eventType: ModelingProductGuideEventType;
    projectId: string;
    projectTaskId?: string | null;
    modelingTaskId?: string | null;
    payload: Prisma.JsonObject;
    generatedBy?: string | null;
  },
) {
  const event = await tx.modelingProductGuideEvent.create({
    data: {
      eventType: input.eventType,
      sourceModule: "modeling-schedule",
      targetModule: "product-guide",
      projectId: input.projectId,
      projectTaskId: input.projectTaskId ?? null,
      modelingTaskId: input.modelingTaskId ?? null,
      payload: input.payload as Prisma.InputJsonValue,
      generatedBy: input.generatedBy ?? null,
    },
    select: productGuideEventSelect,
  });

  return formatModelingProductGuideEvent(event);
}

export async function getModelingProductGuideEvents(filters: {
  projectId?: string | null;
  eventType?: string | null;
  status?: string | null;
  limit?: number | null;
}) {
  const hasEventTypeFilter = Boolean(filters.eventType?.trim());
  const eventType = normalizeProductGuideEventType(filters.eventType);
  if (hasEventTypeFilter && !eventType) {
    return [];
  }

  const limit = Math.min(Math.max(Math.trunc(filters.limit ?? 50), 1), 200);
  const events = await prisma.modelingProductGuideEvent.findMany({
    where: {
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(eventType ? { eventType } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    select: productGuideEventSelect,
  });

  return events.map(formatModelingProductGuideEvent);
}

function normalizeProductGuideEventType(value?: string | null): ModelingProductGuideEventType | null {
  if (!value) {
    return null;
  }

  return modelingProductGuideEventTypes.includes(value as ModelingProductGuideEventType) ? (value as ModelingProductGuideEventType) : null;
}

function formatModelingProductGuideEvent(event: ProductGuideEventRow) {
  return {
    eventId: event.id,
    eventType: event.eventType as ModelingProductGuideEventType,
    sourceModule: event.sourceModule,
    targetModule: event.targetModule,
    projectId: event.projectId,
    projectTaskId: event.projectTaskId,
    modelingTaskId: event.modelingTaskId,
    status: event.status,
    generatedBy: event.generatedBy,
    occurredAt: event.createdAt.toISOString(),
    consumedAt: event.consumedAt ? event.consumedAt.toISOString() : null,
    payload: event.payload,
  };
}

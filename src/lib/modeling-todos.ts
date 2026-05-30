export type ModelingTodoItem = {
  id: string;
  type: "style-list-confirmation";
  title: string;
  projectId: string;
  projectName: string;
  styleCount: number;
  status: "待处理";
  actionLabel: string;
  helper: string;
  styleNames: string[];
  lastUpdatedAt?: string | null;
};

export type ModelingTodoSourceTask = {
  projectId: string;
  projectName?: string | null;
  styleName: string;
  status?: string | null;
  modelingStatus?: string | null;
  lastUpdatedAt?: string | null;
};

export function buildModelingTodosFromTasks(tasks: ModelingTodoSourceTask[]): ModelingTodoItem[] {
  const pendingByProjectId = new Map<
    string,
    {
      projectName: string;
      tasks: ModelingTodoSourceTask[];
    }
  >();

  for (const task of tasks) {
    const status = task.modelingStatus ?? task.status ?? "";

    if (status !== "待确认") {
      continue;
    }

    const group = pendingByProjectId.get(task.projectId) ?? {
      projectName: task.projectName?.trim() || "未命名项目",
      tasks: [],
    };

    if (task.projectName?.trim()) {
      group.projectName = task.projectName.trim();
    }

    group.tasks.push(task);
    pendingByProjectId.set(task.projectId, group);
  }

  return [...pendingByProjectId.entries()]
    .map(([projectId, group]) => {
      const styleNames = group.tasks.map((task) => task.styleName).filter(Boolean);
      const lastUpdatedAt = latestText(group.tasks.map((task) => task.lastUpdatedAt));

      return {
        id: `style-list-confirmation:${projectId}`,
        type: "style-list-confirmation" as const,
        title: "款式清单待确认",
        projectId,
        projectName: group.projectName,
        styleCount: group.tasks.length,
        status: "待处理" as const,
        actionLabel: "确认款式清单",
        helper: `${group.projectName} 已提交 ${group.tasks.length} 款建模款式，需要建模侧确认后才会进入正式排期。`,
        styleNames,
        lastUpdatedAt,
      };
    })
    .sort((left, right) => {
      const timeCompare = (right.lastUpdatedAt ?? "").localeCompare(left.lastUpdatedAt ?? "");
      return timeCompare || left.projectName.localeCompare(right.projectName, "zh-Hans-CN");
    });
}

function latestText(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort((left, right) => right.localeCompare(left))[0] ?? null;
}

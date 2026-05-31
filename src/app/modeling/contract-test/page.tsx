import type { Metadata } from "next";
import {
  ModelingContractTestPage,
  type ModelingContractTestModeler,
  type ModelingContractTestProject,
} from "@/components/modeling/modeling-contract-test-page";
import { AccessDeniedPanel } from "@/components/layout/access-denied-panel";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { canAccessInternalTestTools } from "@/lib/runtime-flags";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "建模排期接口测试",
};

export default async function ModelingContractTestRoute() {
  const currentUser = await requireCurrentUser("/modeling/contract-test");
  if (!canAccessInternalTestTools(currentUser)) {
    return <AccessDeniedPanel />;
  }

  const projectTasks = await prisma.projectTask.findMany({
    where: { taskNo: { in: [7, 10] } },
    select: {
      id: true,
      projectId: true,
      taskNo: true,
      taskName: true,
      status: true,
    },
    orderBy: [{ projectId: "asc" }, { taskNo: "asc" }, { createdAt: "asc" }],
  });

  const projectIds = Array.from(new Set(projectTasks.map((task) => task.projectId)));
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true,
      projectCode: true,
      projectName: true,
      currentStage: true,
      status: true,
      plannedLaunchDate: true,
    },
    orderBy: [{ updatedAt: "desc" }, { projectName: "asc" }],
  });

  const tasksByProjectId = new Map<
    string,
    {
      task7?: ModelingContractTestProject["task7"];
      task10?: ModelingContractTestProject["task10"];
    }
  >();

  for (const task of projectTasks) {
    const grouped = tasksByProjectId.get(task.projectId) ?? {};
    const taskOption = {
      id: task.id,
      taskNo: task.taskNo,
      taskName: task.taskName,
      status: task.status,
    };

    if (task.taskNo === 7 && !grouped.task7) {
      grouped.task7 = taskOption;
    }

    if (task.taskNo === 10 && !grouped.task10) {
      grouped.task10 = taskOption;
    }

    tasksByProjectId.set(task.projectId, grouped);
  }

  const projectOptions: ModelingContractTestProject[] = projects
    .map((project) => {
      const tasks = tasksByProjectId.get(project.id);

      const isTestProject = project.projectCode?.startsWith("MT-TEST-") || project.projectName.startsWith("[建模测试]");

      if (!isTestProject || !tasks?.task7 || !tasks.task10) {
        return null;
      }

      return {
        id: project.id,
        projectCode: project.projectCode,
        projectName: project.projectName,
        currentStage: project.currentStage,
        status: project.status,
        plannedLaunchDate: formatDate(project.plannedLaunchDate),
        task7: tasks.task7,
        task10: tasks.task10,
      };
    })
    .filter((project): project is ModelingContractTestProject => Boolean(project));

  const testModelers: ModelingContractTestModeler[] = await prisma.user.findMany({
    where: {
      isModeler: true,
      status: { not: "停用" },
      name: { in: ["冷茂华", "孟凡菲"] },
    },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }],
  });

  return (
    <ModelingContractTestPage
      currentUserName={currentUser.name}
      currentUserRole={currentUser.authRole}
      initialDate={formatDate(new Date())}
      initialSeed="local-draft"
      projects={projectOptions}
      testModelers={testModelers}
    />
  );
}

function formatDate(value: Date | null) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

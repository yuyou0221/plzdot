# P0 API 路由

## GET /api/health

用途：检查系统和数据库状态。

返回示例：

```json
{
  "ok": true,
  "database": {
    "ok": false,
    "message": "数据库不可用，当前页面会回退到样例数据"
  }
}
```

## GET /api/schedule/board

用途：读取项目排期看板数据。

当前行为：

```text
1. 优先读取数据库。
2. 数据库不可用或没有项目卡片时，回退到样例数据。
```

返回核心字段：

```text
sourceLabel
months
milestones
metrics
projectCards
projectDetails
```

## GET /api/projects/:id

用途：读取单个项目详情。

当前行为：

```text
从统一排期数据源中读取 projectDetails[id]。
后续会改成直接查 projects、schedule results、alerts、work_tasks。
```

## POST /api/projects

用途：从表格视图新增项目规划。

当前行为：

```text
1. 创建 Project 记录。
2. 必填项目名称和计划上线日期。
3. 可选写入路线 routeType 和项目组 projectTeamId。
4. 页面保存成功后会触发 /api/schedule/analyze 刷新预测和风险。
```

请求示例：

```json
{
  "projectName": "小狗7代",
  "plannedLaunchDate": "2026-09-15",
  "routeType": "常规路线",
  "projectTeamId": "产品一组"
}
```

## PATCH /api/projects/:id

用途：从表格视图编辑项目规划字段。

当前可编辑字段：

```text
plannedLaunchDate
routeType
projectTeamId
```

## DELETE /api/projects/:id

用途：从表格视图删除项目。

当前行为：

```text
删除 Project，并清理该项目关联的排期结果、建模进度、工作任务、任务卡、上线调整、拖拽日志和提醒。
```

## POST /api/schedule/analyze

用途：触发重新测算。

当前行为：

```text
1. 如果数据库可用，先创建一个 schedule_runs 批次。
2. 现阶段还没有接入现有 JS 排期脚本，所以 runStatus 暂为“进行中”。
3. 如果数据库不可用，返回 503，并提示继续使用样例数据。
```

请求示例：

```json
{
  "source": "manual",
  "projectIds": [],
  "today": "2026-05-22"
}
```

下一步：

```text
把 project-analysis-v5-excel.js 接入这个接口。
成功后写入 schedule_project_results、schedule_task_results 和 alerts。
```

## POST /api/schedule/adjustments

用途：保存上线日历拖拽形成的规划调整。

当前行为：

```text
1. 接收项目 ID 和目标上线日期，也兼容只传目标月份。
2. 如果传 `toDate`，精确写入该日期；如果只传 `toMonth`，保留原计划上线日期的“日”，只替换年月；如目标月份天数不足则自动落到月底。
3. 更新 Project.plannedLaunchDate。
4. 生成 ScheduleAdjustment 和 TaskDragLog。
5. 接口本身只负责保存；页面上的“保存调整”会在保存成功后继续调用 /api/schedule/analyze 刷新预测、风险和财务影响。
```

请求示例：

```json
{
  "adjustments": [
    {
      "projectId": "project-id",
      "toMonth": "26年5月",
      "toDate": "2026-05-12",
      "reason": "小狗5代 计划上线从 2026-06-06 调整到 2026-05-12"
    }
  ]
}
```

## 用户数据 API

用途：用户数据基础版的人员、团队、建模能力标签和外包供应商维护。

当前路由：

```text
POST /api/users/people
PATCH /api/users/people/:id
POST /api/users/teams
PATCH /api/users/teams/:id
PATCH /api/users/modeler-capabilities/:userId
POST /api/users/vendors
PATCH /api/users/vendors/:id
```

当前行为：

```text
1. 不做删除，停用通过 status=停用 保存。
2. 人员、团队、建模能力标签、外包供应商均写入现有 Prisma 表。
3. 建模能力标签接口会将用户标记为建模师，并重写该用户的擅长 / 不擅长标签。
```

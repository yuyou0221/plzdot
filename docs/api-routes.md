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

## POST /api/schedule/task-fact-events

用途：接收产品组工作指引输出的标准任务事实事件。

当前行为：

```text
1. 仅 admin / manager 可用。
2. 接收单条 ProjectTaskFactEvent；也兼容 { event } 或单条 { events: [...] } 包装。
3. 使用 eventId 做幂等，重复事件不重复写入。
4. 使用 projectId + taskNo 定位 ProjectTask；任务不存在时按 TaskRule 初始化。
5. taskNo 必须是 1-31 的标准任务编号。
6. 写入 ProjectTask 任务事实字段。
7. 写入 ProgressUpdate。
8. 写入 ProjectTaskFactEventLog。
9. 返回 needsRecalculation=true，提示后续应由统一排期内核重新测算。
10. 不写入 ScheduleProjectResult / ScheduleTaskResult，不计算风险、延期、预测上线和里程碑状态。
```

请求示例：

```json
{
  "eventId": "uuid",
  "eventType": "task_completed",
  "sourceModule": "product-guide",
  "projectId": "system-project-id",
  "taskNo": 7,
  "taskKey": "#7",
  "taskName": "精细建模确认风格",
  "occurredAt": "2026-05-29T10:30:00+08:00",
  "operatorId": "user-id",
  "operatorName": "张三",
  "payload": {
    "actualFinishDate": "2026-05-29",
    "status": "已完成",
    "note": "版权方已确认通过"
  }
}
```

支持的事件：

```text
task_started
task_expected_finish_updated
task_submitted_for_review
task_completed
task_blocked
task_unblocked
task_paused
task_resumed
task_note_updated
```

第一版联调契约：

```text
1. 产品组工作指引第一版只发送 task_started 和 task_completed。
2. 产品组只提交任务事实，不提交风险、预测、延期、里程碑状态或产能结论。
3. projectId 必须是系统项目 ID，不用项目编号或项目名匹配。
4. taskNo 必须是 1-31。
5. 日期字段统一 YYYY-MM-DD。
6. occurredAt 必须是带时区 ISO，例如 2026-05-31T10:30:00+08:00。
7. task_completed 如果 payload 带 actualStartDate，且原任务没有 actualStartDate，则补写；如果原任务已有 actualStartDate，不覆盖。
8. 接收成功返回 ok=true、message=项目排期已接收任务事实事件、needsRecalculation=true。
9. 接收失败返回 ok=false 和可读 message，例如 缺少 projectId。
```

task_started 示例：

```json
{
  "eventId": "product-guide:task-event:uuid",
  "eventType": "task_started",
  "sourceModule": "product-guide",
  "projectId": "system-project-id",
  "taskNo": 1,
  "taskKey": "#1",
  "taskName": "市场调研",
  "occurredAt": "2026-05-31T10:30:00+08:00",
  "operatorId": "user-id",
  "operatorName": "张三",
  "payload": {
    "actualStartDate": "2026-05-31",
    "status": "进行中",
    "note": "产品组从工作台启动 #1 市场调研。"
  }
}
```

task_completed 示例：

```json
{
  "eventId": "product-guide:task-event:uuid",
  "eventType": "task_completed",
  "sourceModule": "product-guide",
  "projectId": "system-project-id",
  "taskNo": 1,
  "taskKey": "#1",
  "taskName": "市场调研",
  "occurredAt": "2026-05-31T10:35:00+08:00",
  "operatorId": "user-id",
  "operatorName": "张三",
  "payload": {
    "actualFinishDate": "2026-05-31",
    "status": "已完成",
    "note": "产品组从工作台标记 #1 市场调研 完成。"
  }
}
```

## POST /api/imports/preview

用途：生成 Excel 导入预览，不写入数据库。

当前支持：

```text
project-main：项目主数据 Excel，格式参考“番茄项目规划信息收集”。
```

当前行为：

```text
1. 仅 admin / manager 可用。
2. 接收 .xlsx 文件和 importType。
3. 复用 legacy/schedule-engine/extract_project_excel.py 解析项目信息表、实际进度录入表、任务规则。
4. 按项目编号、项目名称 + IP + 版权方、项目名称 + IP、项目名称依次尝试匹配现有项目。
5. 返回已匹配、待新增、需确认、不可导入、基础资料新增、月度上线数量异常。
6. 只读预览，不会创建项目，不会覆盖项目，不会触发排期重算。
```

## POST /api/imports/apply

用途：确认写入 Excel 导入结果。

当前支持：

```text
project-main：项目主数据 Excel，合并补充模式。
```

当前行为：

```text
1. 仅 admin / manager 可用。
2. 会重新解析并重新生成预览，避免用户绕过预览直接写入。
3. 如果存在不可导入、匹配冲突、数据库不可校验，则拒绝写入。
4. 新项目会创建 Project。
5. 已匹配项目会更新 Project 的基础字段。
6. 会把“实际进度录入表”的开始 / 完成记录转成 ProjectTaskFactEvent 写入任务事实，sourceModule=manual-excel。
7. 写入 DataImport 批次记录。
8. 导入完成后只提示需要重新测算，不会静默触发排期内核。
9. 当前不支持全量替换，也不删除 Excel 中缺失的旧项目。
```

## GET /api/schedule/export-excel

用途：导出与当前项目排期导入文件同结构的 Excel。

当前行为：

```text
1. 仅 admin / manager 可用。
2. 导出一个 .xlsx 工作簿。
3. 工作表包含：项目信息表2026、实际进度录入表、任务规则v4。
4. 项目ID、项目任务ID、taskNo 用隐藏列保存，便于回传稳定匹配。
5. 任务规则v4 为只读规则快照，导入时只用于任务名称匹配，不允许通过 Excel 改核心排期逻辑。
```

## 排期内核调用边界

项目排期 API 不直接调用 legacy 排期脚本。当前统一入口：

```text
src/lib/schedule-engine/service.ts
```

服务层通过 `ScheduleEnginePort` 调用默认 legacy adapter，并通过 `ScheduleEngineResultStore` 保存结果。后续替换核心排期内核时，应新增端口实现，不改页面组件和业务 API。

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

## 登录与权限 API

当前路由：

```text
POST /api/auth/login
POST /api/auth/logout
```

当前行为：

```text
1. 登录成功后写入 httpOnly 会话 Cookie。
2. 未登录访问页面会跳转到 /login。
3. 未登录访问受保护 API 会返回 401。
4. 角色分为 admin、manager、viewer。
5. 用户数据维护接口仅 admin 可写。
6. 项目排期、建模任务、产品组工作指引等业务写接口允许 admin / manager，viewer 只读。
```

## 产品组工作指引 API

用途：产品组工作指引写入任务执行事实和建模款式清单。

当前路由：

```text
PATCH /api/product-guide/tasks/:id
POST /api/product-guide/modeling-tasks
```

当前行为：

```text
1. PATCH /api/product-guide/tasks/:id 支持 complete、expected-finish、submit-review、block、unblock。
2. complete 写入 ProjectTask.actualFinishDate、status=已完成，并记录 ProgressUpdate。
3. expected-finish 写入 ProjectTask.expectedFinishDate 和进度备注，并记录 ProgressUpdate。
4. submit-review 写入 ProjectTask.status=已送审、送审备注，并记录 ProgressUpdate。
5. block / unblock 写入 ProjectTask.isBlocked、blockReason 和进度备注，并记录 ProgressUpdate。
6. POST /api/product-guide/modeling-tasks 写入真实 ModelingTask，并轻量更新 ProjectModelingProgress。
7. 这些写入只记录执行事实，不直接重算预测；页面会提示需要重新测算。
```

## 建模排期 API

用途：建模排期基础版的真实款式分配、外包、状态推进和反馈记录。

当前路由：

```text
PATCH /api/modeling/tasks/:id
```

当前行为：

```text
1. 只保存真实 ModelingTask；虚拟款式会被拒绝，需先由产品组工作指引录入真实款式。
2. 可保存 modelerId、isOutsourced、outsourceVendorId、plannedStartDate、plannedFinishDate、actualStartDate、actualFinishDate、remainingWorkdays、status。
3. 可用 feedbackContent / feedbackType 记录 ModelingFeedback。
4. 状态改为“已通过”时会写入实际完成日期和实际工作日。
5. 每次保存会重算 ProjectModelingProgress。
6. 所有必做款式已通过时，只生成 canWritebackProjectTask=true 和回写提示，不静默修改项目排期基线。
```

# 现有 Prisma Schema 对照改造清单

最后更新：2026-05-27

本文档用于把《P0 数据字典》和当前 `prisma/schema.prisma` 对照，明确哪些现有表可以继续复用，哪些字段需要补，哪些表需要新增，哪些字段应逐步废弃。

本文不是立即执行的迁移脚本。后续真正改库时，应按本文的阶段拆小迁移，每次迁移前备份数据库，并确认 Excel 导入、项目排期、产品组工作指引、建模排期、用户数据页面仍能工作。

## 当前 Schema 总览

当前已有模型：

| 当前模型 | 当前用途 | 结论 |
| --- | --- | --- |
| `Team` | 团队 / 组织占位 | 可短期复用，长期需明确部门和项目小组 |
| `User` | 人员、账号、权限、建模师标记 | 可复用，需要补岗位、部门、产能字段 |
| `ModelerCapabilityTag` | 建模能力标签 | 暂时废弃，不建议继续扩展 |
| `OutsourceVendor` | 外包供应商 | 可复用，字段基本够 P0 |
| `Project` | 项目主表 | 可复用，但字段需要较大调整 |
| `TaskRule` | 任务规则 | 可短期复用，长期应拆为任务定义和任务模板 |
| `ProjectTask` | 项目任务计划 + 事实混合表 | 可短期复用，但需要明确计划 / 事实边界 |
| `ProgressUpdate` | 任务更新记录 | 可复用为任务进度事件，需要补事件字段 |
| `DataImport` | 数据导入批次 | 可复用，需要补导入模式 |
| `ScheduleRun` | 排期测算批次 | 可复用 |
| `ScheduleProjectResult` | 项目级排期结果 | 可复用 |
| `ScheduleTaskResult` | 任务级排期结果 | 可复用 |
| `ModelingTask` | 建模任务，当前同时承载款式信息 | 可短期复用，长期应拆出 `Style` |
| `ModelingFeedback` | 建模反馈 | 可复用为反馈轮次基础 |
| `ProjectModelingProgress` | 项目建模进度汇总 | 可复用 |
| `WorkTask` | 产品组工作任务聚合 | 可复用 |
| `TaskCard` | 看板任务卡 | 可复用 |
| `ScheduleAdjustment` | 排期调整 | 可复用 |
| `ScheduleSimulation` | 排期模拟 | 可复用 |
| `TaskDragLog` | 拖拽日志 | 可复用 |
| `Alert` | 提醒 | 可复用 |

## 总体改造原则

- 不立刻重写全部 schema。
- P0 先补关键字段和关键新表，保证真实业务能跑。
- 当前已经上线测试的数据表尽量兼容，不做大规模字段重命名。
- 规划、事实、计算结果要逐步拆开。
- 所有计算结果仍只由统一排期内核输出。
- Excel 导入优先写输入数据，不直接写计算结果。

## 需要新增的核心模型

### Licensor

当前 `Project.licensorName` 是字符串，无法维护版权方基础资料和送审规则。

建议新增：

```prisma
model Licensor {
  id                 String   @id @default(uuid())
  name               String   @unique
  contactInfo        String?
  defaultReviewNotes String?
  status             String   @default("启用")
  notes              String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```

### IpAsset

当前 `Project.ipName` 是字符串，无法表达一个版权方多个 IP、一个项目多个 IP。

建议新增：

```prisma
model IpAsset {
  id          String   @id @default(uuid())
  licensorId  String
  name        String
  reviewNotes String?
  status      String   @default("启用")
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([licensorId, name])
  @@index([licensorId])
}
```

### ProjectIp

一个项目可能绑定多个 IP。

建议新增：

```prisma
model ProjectIp {
  id        String  @id @default(uuid())
  projectId String
  ipAssetId String
  isPrimary Boolean @default(false)
  notes     String?

  @@unique([projectId, ipAssetId])
  @@index([projectId])
  @@index([ipAssetId])
}
```

### ProductType

当前 `Project.productType` 是字符串，无法稳定绑定任务模板、默认难度、默认建模工作日。

建议新增：

```prisma
model ProductType {
  id                      String   @id @default(uuid())
  name                    String   @unique
  defaultTaskTemplateId    String?
  defaultDifficulty        String?
  defaultModelingWorkdays  Int?
  notes                   String?
  status                  String   @default("启用")
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
}
```

### PlanningCycle

年度规划按春节后第一个月到下一个春节前，不是自然年。

建议新增：

```prisma
model PlanningCycle {
  id                 String   @id @default(uuid())
  label              String   @unique
  startMonth         String
  endMonth           String
  hardMinLaunchCount Int      @default(2)
  hardMaxLaunchCount Int      @default(5)
  softMinLaunchCount Int      @default(3)
  softMaxLaunchCount Int      @default(4)
  notes              String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```

### Style

当前 `ModelingTask` 同时承载款式和建模任务，后续会限制产品组工作指引、原画、样品、财务复用款式数据。

建议新增独立款式表：

```prisma
model Style {
  id                         String    @id @default(uuid())
  projectId                  String
  styleSequence              Int
  name                       String
  artworkFileUrl             String?
  estimatedModelingWorkdays  Int?
  artworkApprovedAt          DateTime? @db.Date
  modelingStartedAt          DateTime? @db.Date
  modelingInternalApprovedAt DateTime? @db.Date
  modelingApprovedAt         DateTime? @db.Date
  earlyModelingApprovalNote  String?
  isRequired                 Boolean   @default(true)
  status                     String    @default("启用")
  createdAt                  DateTime  @default(now())
  updatedAt                  DateTime  @updatedAt

  @@unique([projectId, styleSequence])
  @@index([projectId])
  @@index([status])
}
```

### ModelingAssignmentHistory

当前没有建模换人历史。业务上换建模师必须记录当前进度和原因。

建议新增：

```prisma
model ModelingAssignmentHistory {
  id               String   @id @default(uuid())
  modelingTaskId   String
  fromModelerId    String?
  toModelerId      String?
  changedAt        DateTime @default(now())
  progressSnapshot Json?
  reason           String?
  changedBy        String?

  @@index([modelingTaskId])
  @@index([changedAt])
}
```

### ModelerCapacity

当前 `User.weeklyCapacityStyles` 是“每周款式数”，但新口径是“每周可用工作日”。

建议新增周维度产能表：

```prisma
model ModelerCapacity {
  id                  String   @id @default(uuid())
  userId              String
  weekStartDate       DateTime @db.Date
  availableWorkdays   Float
  unavailableReason   String?
  notes               String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@unique([userId, weekStartDate])
  @@index([weekStartDate])
}
```

### UserBusinessRole

当前 `User.roleTitle` 是单字段，无法表达一个人多个业务角色。

建议新增：

```prisma
model UserBusinessRole {
  id            String   @id @default(uuid())
  userId        String
  roleName      String
  projectTeamId String?
  isPrimary     Boolean  @default(false)
  status        String   @default("启用")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([userId])
  @@index([roleName])
  @@index([projectTeamId])
}
```

### TaskCompletionRequirement

不同任务点击完成时需要不同字段，例如原画结束要上传 PNG / JPG。

建议新增：

```prisma
model TaskCompletionRequirement {
  id               String   @id @default(uuid())
  taskRuleId        String?
  requiredFields    Json
  optionalFields    Json?
  validationRules   Json?
  status            String   @default("启用")
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([taskRuleId])
}
```

## 可复用但需要补字段的模型

### Project

当前字段：

```text
projectCode
projectName
ipName
licensorName
productType
styleCount
projectLevel
routeType
needThreeView
plannedLaunchDate
projectStartDate
projectTeamId
projectOwnerId
artOwnerId
currentStage
status
sourceImportId
notes
```

主要问题：

- `ipName`、`licensorName`、`productType` 是字符串，无法维护基础资料。
- `plannedLaunchDate` 是日期，但业务口径是计划上线月份，具体日期由系统计算。
- 缺少 `planningCycleId`。
- 缺少 `seriesGeneration`、`targetYear`。
- 缺少 `urgencyLevel`。
- `styleCount` 只是预估款式数，字段名应更清晰。

建议新增字段：

| 字段 | 说明 |
| --- | --- |
| `businessProjectCode` | 长期替代或兼容 `projectCode` |
| `primaryLicensorId` | 主版权方 |
| `productTypeId` | 产品类型 |
| `seriesGeneration` | 系列代数 |
| `targetYear` | 目标年份 |
| `urgencyLevel` | 紧急程度 |
| `planningCycleId` | 年度规划周期 |
| `plannedLaunchMonth` | 计划上线月份，建议 `String`，如 `2026-12` |
| `suggestedLaunchDate` | 系统计算建议上线日期 |
| `expectedStyleCount` | 替代或兼容 `styleCount` |

建议保留兼容字段：

| 字段 | 短期处理 |
| --- | --- |
| `projectCode` | 短期继续使用，后续映射到 `businessProjectCode` |
| `projectName` | 短期继续使用，后续可统一为业务层 `name` |
| `ipName` | 作为导入过渡字段保留 |
| `licensorName` | 作为导入过渡字段保留 |
| `productType` | 作为导入过渡字段保留 |
| `plannedLaunchDate` | 短期兼容旧排期页面，长期改为系统建议日期 |

### User

主要问题：

- `teamId` 只能指向一个团队，无法区分公司部门和项目小组。
- `roleTitle` 只能一个岗位，无法表达多角色。
- `weeklyCapacityStyles` 口径已废弃，应改为工作日。

建议新增字段：

| 字段 | 说明 |
| --- | --- |
| `departmentId` | 公司部门 |
| `primaryProjectTeamId` | 主要项目小组 |
| `defaultWeeklyWorkdays` | 默认每周可用工作日 |

建议降级字段：

| 字段 | 处理 |
| --- | --- |
| `teamId` | 短期保留，后续迁移到 `departmentId` / `primaryProjectTeamId` |
| `roleTitle` | 短期保留显示，长期以 `UserBusinessRole` 为准 |
| `weeklyCapacityStyles` | 停止作为产能计算依据 |

### Team

当前 `Team` 可通过 `teamType` 和 `parentTeamId` 同时表示公司部门与项目小组。

P0 低风险方案：

- 继续复用 `Team`。
- `teamType = department` 表示公司部门。
- `teamType = projectTeam` 表示项目小组。
- 项目小组通过 `parentTeamId` 归属到产品团队。

长期方案：

- 如果组织结构复杂，再拆 `Department` 和 `ProjectTeam`。

### TaskRule

当前 `TaskRule` 已经承担任务编号、任务名称、里程碑、标准工作日、前置规则。

P0 建议继续复用，不立刻拆 `TaskDefinition` / `TaskTemplate`。

需要补：

| 字段 | 说明 |
| --- | --- |
| `templateKey` | 所属任务模板或产品类型模板 |
| `sortOrder` | 模板内排序 |
| `isKeyTask` | 是否关键任务 |
| `completionRequirementId` | 完成字段配置 |

长期再拆：

- `TaskDefinition`
- `TaskTemplate`
- `TaskTemplateItem`

### ProjectTask

当前 `ProjectTask` 同时有计划字段和实际字段：

```text
plannedStartDate
plannedFinishDate
actualStartDate
actualFinishDate
expectedFinishDate
status
isBlocked
blockReason
progressNote
```

短期可复用，但要明确边界：

- `plannedStartDate`、`plannedFinishDate` 只能由排期内核或导入的计算结果写入，不应人工编辑。
- `actualStartDate`、`actualFinishDate`、`expectedFinishDate`、`status`、`blockReason`、`progressNote` 是执行事实。

建议新增字段：

| 字段 | 说明 |
| --- | --- |
| `progressStatus` | 当前进度下拉 |
| `lastProgressUpdatedAt` | 最近普通进度更新时间 |
| `lastKeyEventAt` | 最近关键节点事件时间 |

长期可以拆为：

- `ProjectTaskPlan`
- `ProjectTaskFact`

### ProgressUpdate

当前可作为任务变化历史基础，但需要补关键节点事件能力。

建议新增字段：

| 字段 | 说明 |
| --- | --- |
| `eventType` | 进度更新、送审、通过、驳回、交付供应商等 |
| `eventAt` | 事件发生时间 |
| `attachmentUrl` | 附件 |

或者新建 `TaskProgressEvent`，并逐步停用 `ProgressUpdate`。

P0 推荐：先复用 `ProgressUpdate`，补字段。

### DataImport

建议补字段：

| 字段 | 说明 |
| --- | --- |
| `mode` | 合并补充 / 全量替换 |
| `backupPath` | 导入前备份路径 |
| `previewMetadata` | 导入预览摘要 |

### ModelingTask

当前 `ModelingTask` 同时承载款式字段：

```text
styleCode
styleName
originalArtApprovedDate
difficulty
estimatedWorkdays
```

短期继续复用，避免立刻大改建模排期页面。

建议新增字段：

| 字段 | 说明 |
| --- | --- |
| `styleId` | 关联新 `Style`，迁移期可为空 |
| `internalApprovedAt` | 建模内部通过日期 |
| `submittedAt` | 最近送审日期 |
| `approvedAt` | 版权方过审日期 |

建议保留兼容字段：

| 字段 | 处理 |
| --- | --- |
| `styleCode` | 可映射为 `Style.styleSequence` 或显示编号 |
| `styleName` | 迁移期保留 |
| `difficulty` | 短期保留，长期继承项目 / 产品类型，支持款式级例外 |
| `originalArtApprovedDate` | 可映射到 `Style.artworkApprovedAt` |

### ModelingFeedback

当前模型可作为反馈轮次基础。

建议补字段：

| 字段 | 说明 |
| --- | --- |
| `submittedAt` | 本轮送审时间 |
| `feedbackAt` | 当前已有，继续保留 |
| `feedbackType` | 当前已有，需统一枚举：通过 / 驳回 / 修改意见 |

如果字段补齐后，不必新建 `ModelingFeedbackRound`。

### OutsourceVendor

基本可复用。

注意：

- 外包不记录固定可用产能。
- `stableCapacity` 可保留用于标记稳定外包。
- `specialtyTags` 暂时不作为核心逻辑依据。

## 建议逐步废弃或降级的字段 / 表

| 对象 | 原因 | 处理 |
| --- | --- | --- |
| `ModelerCapabilityTag` | 建模师能力标签暂时废弃 | 不再扩展，页面可隐藏或降级 |
| `User.weeklyCapacityStyles` | 产能口径改为每周可用工作日 | 停止参与计算 |
| `Project.ipName` | IP 应结构化 | 保留为导入过渡字段 |
| `Project.licensorName` | 版权方应结构化 | 保留为导入过渡字段 |
| `Project.productType` | 产品类型应结构化 | 保留为导入过渡字段 |
| `Project.styleCount` | 应改为预估款式数 | 映射到 `expectedStyleCount` |
| `User.roleTitle` | 一人多业务角色 | 保留显示，长期迁移到 `UserBusinessRole` |

## P0 改造阶段建议

### 第 1 阶段：补主数据结构

目标：让项目、版权方、IP、产品类型不再只是字符串。

新增：

- `Licensor`
- `IpAsset`
- `ProjectIp`
- `ProductType`
- `PlanningCycle`

修改：

- `Project` 增加结构化外键和规划字段。
- Excel 导入同步写结构化主数据。

风险：

- 项目排期导入脚本需要兼容老字段和新字段。
- 页面展示要优先显示结构化字段，缺失时回退旧字符串字段。

### 第 2 阶段：补款式与建模结构

目标：把款式从建模任务里抽出来，让产品组工作指引可以维护款式事实。

新增：

- `Style`
- `ModelingAssignmentHistory`
- `ModelerCapacity`

修改：

- `ModelingTask` 增加 `styleId`、内部通过、送审、过审字段。
- `ModelingFeedback` 补送审和反馈轮次字段。

风险：

- 当前建模排期已有 105 条真实建模任务，需要迁移生成对应 `Style`。
- 虚拟款式逻辑需要重新确认，不应污染真实 `Style`。

### 第 3 阶段：补产品组工作指引事实结构

目标：让产品组工作指引成为真实执行事实入口。

新增或修改：

- `TaskCompletionRequirement`
- `ProjectTask` 补 `progressStatus`、`lastProgressUpdatedAt`、`lastKeyEventAt`
- `ProgressUpdate` 补事件字段，或新增 `TaskProgressEvent`

风险：

- 当前项目排期脚本读取实际进度的口径要统一。
- Excel 批量写入任务事实时，要能生成历史记录。

### 第 4 阶段：组织和权限细化

目标：用户数据支撑默认项目组、业务岗位、建模产能。

新增：

- `UserBusinessRole`

修改：

- `User` 增加 `departmentId`、`primaryProjectTeamId`、`defaultWeeklyWorkdays`
- `Team` 明确 `teamType` 枚举口径

风险：

- 当前页面可能仍使用 `User.teamId`，需要兼容一段时间。

## 不建议现在做的事

- 不建议立刻删除旧字段。
- 不建议一次性把 `TaskRule` 拆成三张表。
- 不建议立刻把所有页面改成只读新结构。
- 不建议把财务、知识库、送审 AI 的字段提前塞进 P0 schema。
- 不建议把建模师能力标签继续做深，因为业务已确认暂时废弃。

## 下一步工程任务

建议下一步新建一份更具体的执行文档：

```text
docs/P0数据库迁移分阶段方案.md
```

内容包括：

- 每个阶段的 Prisma migration 内容。
- 每个阶段需要修改的导入脚本。
- 每个阶段需要改的页面。
- 每个阶段的回归测试清单。
- 每个阶段的数据库备份和回滚方案。


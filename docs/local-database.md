# 本地数据库说明

P0 工程现在使用项目内的免安装 PostgreSQL，本地文件都放在 `.local/` 目录下。

## 常用命令

```powershell
npm run db:local:start
npm run db:local:status
npm run db:local:stop
```

首次初始化或换电脑时执行：

```powershell
npm run db:local:init
npm run db:migrate
npm run db:seed
```

## 当前连接

开发环境读取 `.env`：

```text
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/project_management_platform?schema=public"
```

本地 PostgreSQL 使用 `127.0.0.1:5432`，数据库名是 `project_management_platform`。

## 当前状态

已完成：

- 免安装 PostgreSQL 下载到 `.local/downloads`
- 数据目录初始化到 `.local/pgdata`
- 数据表迁移完成
- P0 样例数据写入完成
- 页面已从数据库读取项目排期看板
- `重新测算` 已能把 JS 测算结果写回数据库

`.local/` 已加入 `.gitignore`，不要提交本地数据库文件。

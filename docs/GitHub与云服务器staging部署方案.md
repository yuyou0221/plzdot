# GitHub 与云服务器 staging 部署方案

最后更新：2026-05-25

## 目标

使用 GitHub 管理代码版本，使用云服务器部署少数人内部试用的 staging 环境。

第一阶段不追求复杂自动化，先保证：

- 代码来源清楚。
- 数据库可备份。
- 登录权限开启。
- 部署步骤可重复。
- 出问题能快速回滚到上一版。

## 推荐结构

```text
本地开发电脑
  -> GitHub 私有仓库
    -> 云服务器 staging 环境
      -> Next.js 应用
      -> PostgreSQL 数据库
      -> Nginx 访问入口
```

## 分支策略

```text
main      = 稳定基线，不直接开发
staging   = 内部测试上线分支
feature/* = 单模块开发分支，后续需要时再启用
```

当前本地分支：

```text
staging
```

当前关键提交：

```text
4158b05 chore: prepare p0 staging test
6d17ace docs: add staging test checklist
0f44fbc docs: clarify staging commit records
```

## GitHub 仓库建议

当前已使用 GitHub 仓库：

```text
https://github.com/yuyou0221/plzdot
```

当前已提供云服务器：

```text
IP：101.133.16.14
SSH 端口：22，已验证可连通
系统镜像：ubuntu_26_04_x64_20G_alibase_20260509.vhd
```

当前已尝试 `root` 和 `ubuntu` 用户的非交互登录，服务器可达，但当前本机没有可用 SSH 凭证，仍需确认实际登录用户名和认证方式。

2026-05-25 补充排查：

```text
本机私钥：C:\Users\yuyou\.ssh\Plzdot.pem
私钥格式：有效
已尝试用户：root / ubuntu / ecs-user / admin
结果：均未通过 SSH 认证
```

当前判断：服务器网络和 SSH 端口正常，私钥文件也有效；下一步需要在阿里云控制台确认 `Plzdot.pem` 是否已经绑定到 IP 为 `101.133.16.14` 的实例，并确认实际登录用户名。

2026-05-25 再次排查：

```text
用户提供登录用户名：ecs-user
服务器认证方式返回：只允许 publickey
结论：密码登录当前不可用；必须绑定可用密钥，或在服务器侧开启密码登录。
```

随后也尝试了 `root` 密码登录，服务器同样返回只允许 `publickey`。部署文档不记录任何密码。

推荐处理方式：在阿里云控制台把 `Plzdot` 密钥对绑定到 IP 为 `101.133.16.14` 的实例。绑定后如控制台提示需要重启实例，应按提示重启。绑定生效后再使用：

```powershell
ssh -i C:\Users\yuyou\.ssh\Plzdot.pem ecs-user@101.133.16.14
```

最低要求：

- 仓库设为 private。
- 不上传 `.env`、数据库备份、真实密码。
- `main` 分支保护可以后续再做，第一阶段先不要增加太多流程。
- 日常测试部署只推 `staging` 分支。

本地已连接远程仓库：

```powershell
git remote add origin https://github.com/yuyou0221/plzdot.git
git push -u origin staging
```

如果以后需要同步 main：

```powershell
git push -u origin main
```

## 云服务器建议

第一阶段建议使用一台普通 Linux 云服务器：

```text
系统：Ubuntu LTS
内存：至少 2GB，建议 4GB
磁盘：至少 40GB
网络：只开放 SSH、HTTP、HTTPS
```

服务器上建议安装：

```text
Git
Node.js
PostgreSQL
Nginx
PM2 或 systemd
```

说明：

- Node.js 版本以能稳定运行当前 Next.js 项目为准。
- PostgreSQL 可以放在同一台服务器上；后续正式使用时再考虑托管数据库。
- PM2 用来守护 Next.js 进程，第一阶段比手写 systemd 更省事。

## 服务器目录建议

```text
/opt/project-management-platform/staging
```

不要把 `.env` 放进 Git，只在服务器本地创建：

```text
/opt/project-management-platform/staging/.env
```

可以参考：

```text
.env.staging.example
```

## staging 环境变量

必须配置：

```text
DATABASE_URL
AUTH_ENABLED=true
NEXT_PUBLIC_AUTH_ENABLED=true
AUTH_COOKIE_SECURE=false
AUTH_SECRET
INITIAL_ADMIN_LOGIN
INITIAL_ADMIN_PASSWORD
```

注意：

- `AUTH_SECRET` 必须是长随机字符串。
- `INITIAL_ADMIN_PASSWORD` 必须是强密码。
- `admin / admin123456` 只允许本地开发使用。
- `.env` 不提交到 GitHub。
- 当前 staging 先通过 IP + HTTP 访问，因此 `AUTH_COOKIE_SECURE=false`。后续绑定域名并启用 HTTPS 后，应改为 `true`。

## 第一次部署步骤

在云服务器上：

```bash
cd /opt
git clone <GitHub 仓库地址> project-management-platform
cd /opt/project-management-platform
git checkout staging
```

创建 `.env`，内容参考 `.env.staging.example`。

安装依赖并初始化数据库：

```bash
npm ci
npm run db:migrate
npm run db:generate
npm run build
```

启动应用：

```bash
npm run start -- -p 3000
```

如果使用 PM2：

```bash
pm2 start npm --name project-management-staging -- run start -- -p 3000
pm2 save
```

## Nginx 访问入口

推荐让外部访问 Nginx，Nginx 再转发到本机 `3000` 端口。

示例：

```nginx
server {
    listen 80;
    server_name your-domain-or-ip;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果有域名，后续应加 HTTPS。

## 更新部署步骤

每次本地确认 `staging` 可用后：

```powershell
git push origin staging
```

服务器上：

```bash
cd /opt/project-management-platform
git fetch origin
git checkout staging
git pull --ff-only origin staging
npm ci
npm run db:migrate
npm run build
pm2 restart project-management-staging
```

如果没有使用 PM2，则重启对应的 Node 进程。

## 数据导入

当前真实排期数据文件：

```text
.local/actual-run-20260525-v10/project-task-estimates-v5.json
```

`.local` 不进入 GitHub，因此 staging 服务器需要单独上传数据文件，或在服务器上重新跑测算脚本生成。

导入命令：

```bash
npm run db:import:actual -- .local/actual-run-20260525-v10/project-task-estimates-v5.json
```

导入前建议先备份数据库。

## 数据库备份

每次更新部署、重新导入 Excel 或排期结果前，先备份。

示例：

```bash
pg_dump "$DATABASE_URL" > backup-before-import-$(date +%Y%m%d-%H%M%S).sql
```

备份文件不要提交到 GitHub。

## 回滚方式

如果新版本出问题：

```bash
cd /opt/project-management-platform
git log --oneline
git checkout <上一个可用提交>
npm ci
npm run build
pm2 restart project-management-staging
```

如果数据库迁移已经执行，回滚前要先判断是否需要恢复数据库备份。

## 上线验收

沿用：

```text
docs/staging测试上线检查清单.md
```

最小验收：

- `/login` 能打开。
- 未登录访问业务页面会跳回登录页。
- 管理员能登录。
- `/` 项目排期能加载。
- `/product-guide` 产品组工作指引能加载。
- `/modeling` 建模排期能加载。
- `/users` 用户数据能加载。
- `viewer` 账号不能写业务数据。

## 现在还需要的信息

继续部署前，需要补齐：

- SSH 登录用户名。
- SSH 登录方式：密码或私钥。如果使用私钥，需要确认密钥已经绑定到该实例。
- 是否已有域名。
- 数据库放服务器本机，还是使用云厂商托管数据库。
- staging 管理员初始密码。

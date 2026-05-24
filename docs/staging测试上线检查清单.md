# staging 测试上线检查清单

最后更新：2026-05-25

## 当前状态

当前已经建立 `staging` 分支，用于内部测试上线，不直接把未验证内容推到 `main`。

关键提交记录：

```text
分支：staging
功能准备：4158b05 chore: prepare p0 staging test
测试清单：6d17ace docs: add staging test checklist
```

最新提交以 `git log --oneline --decorate -3` 为准。

这次 staging 覆盖的 P0 范围：

- 项目排期
- 产品组工作指引
- 建模排期
- 用户数据
- 登录与权限基础版
- 统一排期内核使用规范
- Excel 数据接口草稿

## staging 的目标

staging 不是正式上线，而是少数人内部试用环境。

它要验证的是：

- 真实数据能否稳定导入。
- 四个 P0 页面能否跑通。
- 登录与基础权限能否挡住未登录访问。
- 项目排期、产品组工作指引、建模排期之间的输入输出关系是否符合业务口径。
- 不出现明显错误口径，尤其是排期、送审、财务相关结论。

## 上线前必须确认

代码状态：

- 当前分支必须是 `staging`。
- 工作区必须干净。
- `npm run lint` 通过。
- `npm run build` 通过。

部署环境变量：

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

- staging / production 不能使用本地默认 `AUTH_SECRET`。
- staging / production 首次创建管理员前必须配置 `INITIAL_ADMIN_PASSWORD`。
- 默认 `admin / admin123456` 只适合本地开发，不适合测试上线。
- 当前通过 IP + HTTP 测试时，`AUTH_COOKIE_SECURE=false`；后续启用 HTTPS 后改为 `true`。

## 数据库初始化

新环境第一次部署后执行：

```powershell
npm run db:migrate
npm run db:generate
```

如果 staging 要使用当前真实排期数据，再导入最近一次测算结果：

```powershell
npm run db:import:actual -- .local\actual-run-20260525-v10\project-task-estimates-v5.json
```

如果 `.local` 文件没有同步到 staging 机器，需要先把对应测算结果文件带过去。

当前本地最近一次真实数据口径：

```text
数据文件：.local/actual-run-20260525-v10/project-task-estimates-v5.json
导入批次：actual-import-1779649008073
项目数：44
```

## 页面验收

最小验收路径：

1. 打开 `/login`，使用 staging 管理员账号登录。
2. 打开 `/`，确认项目排期能加载。
3. 切换规划视图、压力预测、上线日历。
4. 打开 `/product-guide`，确认产品组工作指引能加载。
5. 打开 `/modeling`，确认建模排期能加载。
6. 打开 `/users`，确认用户数据能加载。
7. 退出登录后，再访问 `/users`，应跳回 `/login`。

重点业务样本：

- 小鸟4代：检查延期完成口径。
- 兔老大表情包mini：检查前置任务填表异常是否暴露。
- 无牙仔猫猫：检查启动晚导致预测晚的解释是否合理。
- 插画小人mini2代：检查任务 10 已开始但任务 7 未完成的异常。

## 不建议上线的情况

出现以下任一情况，不建议继续让更多人试用：

- 排期页面无法加载真实数据。
- 未登录可以直接访问业务页面。
- `admin / manager / viewer` 写权限明显失效。
- 项目排期、产品组工作指引、建模排期对同一个项目给出互相冲突的完成状态。
- Excel 导入或排期测算结果不可追溯。
- staging 数据库没有备份或无法重建。

## 当前缺口

可以先不阻塞 staging，但需要记录：

- 还没有修改本人密码页。
- 还没有首次登录强制修改密码。
- 还没有审计日志。
- 还没有按钮级权限。
- 还没有正式的部署脚本。
- 已决定使用 GitHub，但还没有配置远程仓库地址。
- 已决定使用云服务器，但还没有配置服务器环境。
- 建模排期和产品组工作指引还没有完全触发统一重新测算。

## 下一步

建议顺序：

1. 建 GitHub 私有仓库。
2. 推送 `staging` 分支。
3. 准备云服务器。
4. 配置 staging 环境变量。
5. 初始化 staging 数据库。
6. 导入真实排期数据。
7. 按本清单做页面验收。

具体部署方案见：

```text
docs/GitHub与云服务器staging部署方案.md
```

# 首次创建关闭入口的 Atlas Worker

这份流程连接已验证的 D1 与随后要绑定的 Access 策略。它仅创建新的 `atlas-agent-private` Worker，关闭 `workers.dev`、预览 URL、定时任务和模型；不修改 Access、DNS 或现有数据库，不发布 Atlas 首页入口。

## 当前接入记录

2026-11-21，main 的 D1 首次创建和两份迁移已通过真实云端工作流，Owner 核对 UUID 后的只读复核返回 `existing_schema_verified`：[创建记录](https://github.com/yuechuanhou/embodied-ai-atlas/actions/runs/44897836642)、[复核记录](https://github.com/yuechuanhou/embodied-ai-atlas/actions/runs/44898423999)。这些是该时点的观察，不代表后续运行自动通过。

Owner 已在会话中提供 Zero Trust team domain，并确认保存了访问策略；尚未通过当前连接读取或测试真实策略。个人邮箱和 team domain 保留在私有配置中，不写进公开仓库。策略保存不等于它已经保护了 Worker。

## 1. 添加独立的 Worker 部署凭据

沿用已经设置 Owner 审核、仅允许 main 的 `atlas-agent-bootstrap` Environment，并复用其中的 `CLOUDFLARE_ACCOUNT_ID`、`ATLAS_D1_DATABASE_ID`。

在目标 Cloudflare 账号中创建专用短期 token，命名例如 `atlas-worker-setup`，仅选择目标账号：

| 权限 | 用途 |
| --- | --- |
| Workers Scripts / Edit（API: Workers Scripts Write） | 首次上传固定名称的 Worker，并读取其设置 |
| Account Settings / Read | Wrangler 读取账号的 Workers 设置 |
| D1 / Read | 只读核对指定 UUID 和固定数据库名 |

不选择通用 Workers 模板中的其他产品权限。此阶段无需 Access、DNS、Workers Routes、D1 Edit、模型或账单权限。账号级 Workers Scripts 写权限可能影响该账号其他 Worker，也可能通过部署代码使用绑定资源；不能把脚本中的固定名称检查当成 Cloudflare 强制的单 Worker 隔离。成功创建后可撤销该短期 token；实际后续权限按单个 Worker 能力重新核对。

将新 token 直接保存为 Environment Secret **`CLOUDFLARE_WORKER_API_TOKEN`**。原来的 D1 token 保留原用途；不扩权、不覆盖。不要将 token 发到聊天或工作流输入中。

## 2. 合并获批代码后运行

工作流是 `.github/workflows/stage-agent-worker.yml`，名称 **Stage closed Atlas Worker**。只接受 main 的手动运行；PR、push、普通网站部署不会创建 Worker。沿用 Environment 审核，不上传生成配置、Wrangler 日志或运行凭据。

1. 先运行 `mode=plan`，预期 `would_create_closed_worker`、`mutations=false`。
2. 审阅账号和计划后运行 `mode=stage`，`confirmation=atlas-agent-private`，审核 Environment。
3. 成功结果应为 `created_closed_worker`，`workers_dev=false`、`preview_urls=false`、`scheduled_tasks=false`、`model=disabled`。
4. 可以再运行 plan，核对绑定、入口状态和定时任务，预期 `existing_closed_worker_verified`。

检查 D1 只读取数据库元数据，不执行 SQL，也不再次迁移。缺少 UUID、数据库名称不符、凭据不足、API 错误均停止。stage 遇到已存在的 Worker 一律拒绝覆盖，即使它看起来符合配置；plan 可以读取它的设置。

Wrangler 使用固定的绝对代码路径、临时 0600 配置和固定生产名称；所有公开入口关闭，不设置 routes，没有后台同步和真实身份变量。运行环境的现有 JWT 校验在缺少身份配置时拒绝请求。

上传失败或后续验证失败时，资源可能已创建；保留现状、先运行 plan 并在控制台核对，不自动删除、重建、回滚或重试。首次创建检查与上传不是云端原子事务；审核期间不要从其他终端并发部署同名 Worker。

## 3. 给单个 Worker 绑定现有 Access 策略

完成创建后，在 Cloudflare **Workers & Pages → atlas-agent-private → Access → Protect this Worker behind Access**：

1. 范围选择 **All traffic**。
2. 选择已经保存的 Owner 专用策略，例如 `atlas-owner-only`。
3. 核对策略只有确切 Owner 邮箱的 Allow 规则，使用已设置的 One-time PIN 登录。
4. 保存 **Apply Access**。只绑定这个 Worker。

然后进入 Zero Trust 的 Access 应用详情，核对该应用保护的是同一个 Worker，并记录实际 application AUD。Worker 级策略能覆盖其生产入口与预览；这是 Cloudflare 的访问控制范围，本流程仍保持所有入口关闭。

下一步还需在服务端私有配置中设置 `OWNER_EMAIL`、`ACCESS_ISSUER`、`ACCESS_AUD`、准确的 `PRIVATE_ORIGIN`。Team issuer 与 workers.dev 子域名是不同设置，不能由前者推测后者。记录实际 Workers 子域名后，工作台 origin 应为 `https://atlas-agent-private.<实际账号子域名>.workers.dev`。

这些参数和 Access 保护验证完成后，再审阅启用入口、恢复同步和登录验收的部署。当前工作流没有 activate 模式，不会把“策略已保存”视为登录验证通过，也不启用正式模型或 GitHub 写入。

## 4. 验证依据

新增测试覆盖只读计划、配置校验、数据库身份、固定目标、拒绝覆盖、关闭入口与预览、禁止 Cron/模型、异常中断和输出脱敏。已有真实 Workers/D1 测试继续验证 Owner JWT 拒绝路径。临时 staging 配置需使用固定 Wrangler 版本进行离线 dry-run；本地与 CI 不使用真实部署凭据，也不代替首次云端验收。

官方参考：[Workers Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)、[workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)、[GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)、[D1 元数据](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/)、[Worker 设置](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/get/)、[入口状态](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/subdomain/methods/get/)、[Cron 状态](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/schedules/methods/get/)。

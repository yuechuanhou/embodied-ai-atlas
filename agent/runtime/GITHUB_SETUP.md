# GitHub 执行的 D1 首次接入

状态：2026-11-21 已在受保护的 GitHub Environment 配置凭据、运行真实云端工作流、创建专用数据库并通过两份迁移及准确 UUID 的只读复核。Access 与 Worker 尚未完成上线验收；后续见 [Worker 首次创建流程](WORKER_SETUP.md)。Cloudflare 账号在 Owner 自己的浏览器可登录，当前云端浏览器登录失败；随后设备授权的凭据接收又被执行环境网络策略阻止。不能将“Owner 已在授权页同意”记作当前环境已登录。

这份流程从 GitHub runner 访问 Cloudflare 官方 API，是独立的部署执行方式。无需将浏览器会话、密码、OAuth 回调或 API token 发到聊天。旧设备授权若仍显示在账号授权列表中，可在新方式验证后由 Owner 撤销；本流程不会替用户修改账号授权。

## 这一步的范围

- 只允许固定数据库 `atlas-agent-private`，以仓库两份版本化 SQL migration 初始化。
- `plan` 默认只读；`apply` 还必须填写准确的数据库名称确认。
- 已有同名数据库须由 Owner 核对并配置其准确 ID；只核验已应用的迁移与必要表，不对已有数据库执行迁移、清空或删除。
- 新建后若初始化中断，保留数据库并停止。先在控制台核对状态，再另行审阅修复；不自动删库、重建或重试不明结果。
- 不创建/部署 Worker，不配置 Access、DNS、公开入口、模型或订阅。存储成功后仍须完成独立的身份接入和恢复验收。

## 1. 先配置受保护的 GitHub Environment

在本仓库 Settings → Environments 建立 `atlas-agent-bootstrap`：

1. Required reviewers 选择 Owner；个人操作需要允许 Owner 审核自己发起的运行。
2. Deployment branches/tags 只允许 `main`。
3. 然后添加下表 Secrets。不要将部署凭据存为普通变量或提交进文件。

| Secret | 内容 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Owner 在 Cloudflare 控制台核对的目标 account ID，32 位十六进制 |
| `CLOUDFLARE_API_TOKEN` | 专用于此次接入、仅目标账号的 D1 写入权限 token |
| `ATLAS_D1_DATABASE_ID` | 首次创建时留空；如已有同名数据库，须核对后填写准确 UUID |

Environment 的审核规则必须在添加凭据前设置。工作流本身不能替代平台保护规则，也不宣称已替用户完成这些设置。仓库是公开的，运行结果只输出状态和 migration 数量；不会上传数据库导出、账号信息、临时配置或私有运行日志。

## 2. 在自己的 Cloudflare 控制台创建最小范围 token

从个人资料的 API Tokens 或目标账号的 Account API Tokens 创建专用 token：

- 权限仅需 D1 写入（官方 API 名称 `D1 Write`，控制台可能显示 D1 / Edit）。
- Account resources 只选目标个人账号，不选所有账号。无需 Workers、Access、DNS、账单或其他产品权限。
- 建议为本次接入设置短有效期；成功验证后可撤销。

创建新数据库前没有可限定的数据库 UUID，因此此次凭据的 D1 写入范围可能覆盖目标账号内其他 D1 资源。代码仅操作固定 Atlas 名称；不能把这个代码约束描述成 Cloudflare 强制的单数据库 token 隔离。若这个范围不可接受，由 Owner 在自己的控制台手动创建/初始化数据库，待 UUID 明确后再评估更窄的权限方案。

将 token 直接填入上一步 GitHub Environment Secret。不要粘贴进聊天、Issue、PR、工作流输入或终端命令参数。GitHub/Cloudflare 账户的正常登录和凭据创建由 Owner 完成。

## 3. 合并审阅过的代码后手动运行

此工作流依赖先前 Agent PR，需按依赖顺序审阅合并。未经 Owner 明确授权不合并 main。工作流为 `.github/workflows/provision-agent-d1.yml`，只通过 `workflow_dispatch` 启动，不随 push 或 PR 创建资源，并只接受 main。

1. Actions → **Provision private Atlas D1** → Run workflow，选择 main、`mode=plan`。审核 Environment 后检查结果。
2. 确认目标账号和计划后，手动运行 `mode=apply`，`confirmation=atlas-agent-private`，再审核 Environment。
3. 新建成功后在 Cloudflare 控制台核对固定名称、迁移记录与表结构，将该库 UUID 填入 `ATLAS_D1_DATABASE_ID`。
4. 再运行 plan，预期 `existing_schema_verified`，不产生数据库写入。

同名数据库存在而 ID 未配置时，plan 只提示核对；apply 拒绝接管。已有库迁移历史不匹配时也停止，不读取聊天内容来判断归属。数据库列表超过本脚本的有界检查范围时拒绝继续，应先审阅扩容处理。

2026-11-21 的真实云端结果：[创建并初始化](https://github.com/yuechuanhou/embodied-ai-atlas/actions/runs/44897836642)，返回 `created_and_initialized`、两份迁移；[准确 UUID 的只读复核](https://github.com/yuechuanhou/embodied-ai-atlas/actions/runs/44898423999)，返回 `existing_schema_verified`、`mutations=false`。CI 仍使用模拟 HTTP；这些运行记录不代替 Access/Worker 验收。原有 Pages 工作流不负责部署此私有数据库。

## 4. 存储接入后的身份步骤

Owner 在自己的 Cloudflare 控制台启用 Zero Trust，并核对免费计划/服务条款，再建立只允许会话中确认的确切 Owner 邮箱的 Access 策略。邮箱验证码可作为首轮方式。这里的 D1 token 不含 Access 权限，因此无法用它创建身份策略。

随后按 [Worker 首次创建流程](WORKER_SETUP.md) 先创建入口关闭的独立 Worker，给单个 Worker 绑定现有 Owner 策略，再核对 team issuer、application AUD、工作台准确 origin，与 Owner 校验、导出恢复一起验收。所有条件满足后才考虑启用私人工作台及公开 Atlas 入口；合并和实际创建资源仍需当前步骤的明确授权。

官方参考：[GitHub Actions 接入](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)、[D1 创建 API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/create/)、[D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)、[GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment)。

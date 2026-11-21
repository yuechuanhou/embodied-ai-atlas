# 私人运行环境接入方案

本文件是待执行配置方案，**不是部署记录**。当前 PR 不创建账号、资源、DNS 记录，不设置 Secrets，也不合并 main。

## 1. 账号接入前已准备好的内容

- 独立 Worker，打包入口 `src/index.js`；没有静态资源路由绕过身份校验。
- D1 两个版本化迁移；默认关闭模型。
- 自动同步固定 Atlas 仓库与公开站点，不授予 GitHub 写权限。
- 公开站可以按需启用私人工作台入口；只通过 URL fragment 传公开的 Article/Topic/anchor/视图 ID，不传聊天、选中文本或凭据。

唯一允许的登录邮箱已经由 Owner 在会话中提供，不在公开文件中重复记录。账户是否注册、Zero Trust team domain、Access AUD 和模型 API 是否开通，均未代替用户验证。

## 2. 首次接入的最小选择

建议先使用 **受 Access 保护的 workers.dev 工作台**，无需迁移 Portfolio/Atlas 的 DNS。自定义子域名在核对当前 DNS 和账号管理范围后再决定。不要为了接入 Agent 将整个 `yuechuanhou.com` 区域静默迁移到 Cloudflare。

账号就绪后，选择单个 Atlas Worker 的 Access 保护，生产入口仅允许指定 Owner；不开放邮箱后缀、所有注册用户或访客。预览入口保持关闭；未来启用预览时必须单独核验保护与 audience。无需为此更改其他 Workers 或 Personal OS 应用的权限。

`wrangler.jsonc` 目前设置 `workers_dev: false`、`preview_urls: false`、全零 D1 ID 且无 routes。先建立/核验保护，再在真实本地配置里启用已选定入口。即使边缘政策配错，Worker 本身仍验证签名、Owner 和准确 origin。

## 3. 私有配置契约

在 `agent/runtime/` 复制 `wrangler.jsonc` 为忽略的 `wrangler.local.jsonc`。保持名称与数据库仅服务 Atlas，替换 database ID；不提交真实账号或个人邮箱。以下值通过 Cloudflare 私有配置/Secrets 提供，不在聊天或公共 PR 粘贴密钥。

| 名称 | 何时需要 | 内容 |
| --- | --- | --- |
| `OWNER_EMAIL` | 必须 | 唯一 Owner 的确切邮箱，与 Access policy 一致 |
| `ACCESS_ISSUER` | 必须 | `https://<team>.cloudflareaccess.com`，不带末尾斜杠 |
| `ACCESS_AUD` | 必须 | 该 Worker Access application 的 AUD |
| `PRIVATE_ORIGIN` | 必须 | 已选工作台的准确 HTTPS origin，不含路径/查询 |
| `GITHUB_READ_TOKEN` | 建议 | 限 Atlas 的只读凭据；Contents 与 Actions 读取，无写权限 |
| `MODEL_PROVIDER` | 模型接入时 | `openai` 或 `anthropic`；其余值不启用模型 |
| `MODEL_NAME` | 模型接入时 | 账户确实可调用的模型 ID，先做真实最小请求验证 |
| `MODEL_API_KEY` | 模型接入时 | 服务端模型项目密钥 |
| `DAILY_CALL_LIMIT` | 模型接入时 | 明确的正整数日调用上限，按 UTC 日计数 |
| `DAILY_TOKEN_LIMIT` | 模型接入时 | 明确的正整数日 token 上限 |

缺少完整模型配置不会自动选择/购买模型，而是保留站内检索。每次请求最多输出 1536 tokens，输入最多 24 KB；调用前以保守额度预留，成功后按供应商报告调整。失败/结果不明时保留预留值。此额度不是美元硬账单上限，模型项目本身仍须配置合适的预算/告警。

可用 Wrangler 的交互式 Secret 输入，例如从本目录运行：

```sh
npx --no-install wrangler secret put MODEL_API_KEY --config wrangler.local.jsonc
```

该命令用于账号授权后的实际接入，本轮未执行。不要将 key 写入 shell 参数、前端、普通数据库表或日志。

## 4. 实际执行顺序

1. 核对 Cloudflare 账号与 Zero Trust；完成必要的本人登录/账号确认。
2. 创建专用 D1 和 Worker 的准确配置，保持公开入口关闭。备份/恢复与保留策略也在这一步确认。
3. 在预览/本地数据库应用 migrations，验证实际 Wrangler 迁移记录和数据恢复，再对目标私有数据库执行获批迁移。
4. 配置该 Worker 的 Owner-only Access，记录 issuer/AUD，设置 Worker 私有身份变量；启用已选域名并部署获批代码。
5. 验证匿名访问、错误邮箱、过期身份、退出后访问、直接 API、错误 origin 和预览 URL 全部拒绝；Owner 正常读取/保存会话。
6. 在 main 发布公开构建产物后，同步真实 Pages 快照。验证手动 GitHub 更新、main 领先、同步失败和内容增删。
7. 选择并开通一个模型 API，设置私有 key/模型 ID/额度；以真实低量请求验证官方协议、来源标识和预算。两个适配器目前只通过网络模拟测试。
8. 最后才在 GitHub 的仓库变量设置 `ATLAS_AGENT_ORIGIN` 为已验证的 private origin。下次公开站构建显示入口；不设置则不显示占位链接。这个变量是入口元数据，不是凭据。

正式模型/数据上线需要实际账号验证；本地测试不替代它。创建资源或修改访问设置前，应审阅实际账号、主机名、资源和预算；本轮还没有这些已验证配置。

## 5. 日常运行和恢复

- Cron 每五分钟核对；问答前最多复用一分钟核对结果。没有公开 webhook，也没有公开写 API。
- 同步只接受当前 main 的成功 Pages workflow/deploy job 及线上内容摘要。CI 工作流名称/部署 job 结构变化时应同步修改契约和测试。
- API 错误只返回固定错误码；不记录原始对话、模型响应、JWT 或密钥。Observability 默认关闭；需要日志时只启用经过检查的字段。
- 首次真实迁移前导出备份；恢复到隔离数据库做演练。恢复期间停用模型调用及未来发布任务，不能从旧状态自动重放付费请求或批准。
- 暂未设置自动删除周期。会话删除的边界、审计保留和备份删除窗口要按真实存储能力说明，不宣称即时永久抹除。

官方核对依据：[Workers Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)、[JWT 校验](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)、[D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/)、[OpenAI quickstart](https://developers.openai.com/api/docs/quickstart)、[Claude Messages](https://platform.claude.com/docs/en/api/messages/create)。

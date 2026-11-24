# 私有提案自动校验（历史可选方案）

当前主线已改为 [单仓库分阶段检查](../runtime/PUBLICATION.md)，不接入此执行器、新仓库、专用 App 或机器网关。以下保留早期可选实现的边界；当前没有生产接入验收。

本轮代码提供私有 Actions 执行器、任务绑定、结果核对与 Orbit 状态展示。账号接入和生产验收尚未执行。默认没有 `VALIDATION_CONFIG`，保留现有提案准备能力；不查询新表、不创建 Actions 任务。它不自动部署 Orbit 程序，也不创建公开分支、PR、批准或发布任务。

## 一套检查，准确的 after-image

1. 私人提案保存成功后创建独立校验任务；模型调用结果先持久化，校验启动失败不使它变成需要重新计费的请求。
2. GitHub App 只安装到专用私有执行器仓库，只授予 Metadata:read（隐含）、Contents:read（核对 main SHA）与 Actions:write。运行时使用限定该仓库 ID 和上述权限的短期 installation token；没有 Contents 写入或 PR 权限。执行器不接触 App 私钥、模型密钥、D1 凭据或完整聊天。
3. `workflow_dispatch` 输入只有不透明任务 ID。私有工作流从批准的 Atlas commit 下载 runner，不复制权威文章或维护另一套校验逻辑。实际仓库 checkout 使用服务端绑定的 `base_commit`；草稿只能提供 schema 允许的 content after-images，不能选择执行程序或依赖。
4. runner 用当前统一的哈希锁定依赖，在排除 Actions/OIDC 凭据的子进程中执行 `agent/change_validation.py`。它检查 envelope、知识身份/关系、内容、整站构建、渲染安全及现有 smoke 回归。临时目录退出即清理，不上传草稿、构建 HTML、失败 stdout、日志正文、artifact 或 cache。
5. 报告仅允许五项结构检查、文章/Topic 数量和固定错误码。既要匹配任务绑定，也要通过 GitHub API 核对准确运行最终成功，才显示通过。技术事实、文风、公开范围审阅仍为 pending，`publishable` 始终为 false。

## 机器身份与私人入口

新增的轻量 gateway 只有 `/validation/<job>/claim`、`report`，通过 Service binding 调用现有 Worker 的命名入口 `ValidationBroker`。它没有 DB 或 Secrets，不转发通用工作台 API。命名入口在读 D1 前验证 GitHub OIDC 签名、issuer、任务专用 audience、有效期、仓库/Owner 数字 ID、private visibility、main ref、固定 workflow SHA、GitHub-hosted runner 与第一运行尝试，再核对服务端 dispatch 得到的 run ID。正常工作台入口仍使用原 Owner Access JWT 和同源写入保护；不更改 Access 策略或开放私人页面。

OIDC 证明执行身份，不是 Owner 的公开授权。任务结果绑定 `proposal_id`、version、patch digest、base、contract、执行器配置摘要。领取、回传和读取时重新核对当前提案/候选和已发布快照。旧版本可查看，过期结果不能作为当前通过依据。新报告不能覆盖旧报告，也不能上报「已批准」。

任务保存在递增 migration `0003_proposal_validation.sql` 的独立表中；不修改既有 migration、提案版本或发布 jobs。旧环境只有前两份迁移时，校验保持未配置，原有学习和提案 API 可继续使用。

## 后续一次性接入（需 Owner 确认）

1. 合并代码并核对确切 commit；按现有手动批准方式更新 Orbit。校验未配置时不会启动任务。
2. 新建 Atlas 专用 private repository。用 `prepare_workflow.py --revision <批准的 Atlas SHA> --origin <gateway HTTPS origin> --output <新文件>` 生成 `.github/workflows/validate.yml`，仅装入该私有仓库。记录仓库/Owner/workflow ID 和私有 main 的准确 SHA。不要把模板放进 Atlas 的 `.github/workflows` 自动运行。
3. 创建并安装上述最小权限 App。将下载的 RSA key 在本地转换为 PKCS#8，再存入 Worker Secret `VALIDATION_APP_PRIVATE_KEY`；不发到对话、前端、runner 或仓库。
4. 在确认生产数据库身份及恢复点后，仅应用新增 migration；不重跑 bootstrap 创建库，不重置数据。先完成命名入口部署，再从关闭公网入口的 `wrangler.validation-gateway.jsonc` 创建 gateway；Owner 确认后启用该机器接口的 workers.dev。工作台的 Access 登录保持原样。
5. 将下列准确配置作为 Worker Secret `VALIDATION_CONFIG` 保存。所有值来自实际接入，不接受客户端设置。只有 migration、执行器和身份均就绪后才设 `enabled:true`。

```json
{
  "enabled": true,
  "repository": "yuechuanhou/<private-executor>",
  "repository_id": "<numeric-id>",
  "owner_id": "<numeric-id>",
  "workflow_id": "<numeric-id>",
  "workflow_sha": "<private-main-40-hex-commit>",
  "validator_revision": "<approved-Atlas-40-hex-commit>",
  "origin": "https://<gateway>.<account>.workers.dev",
  "app_id": "<numeric-id>",
  "installation_id": "<numeric-id>"
}
```

私有执行器若不具备免费套餐的分支保护能力，仍必须保持唯一 Owner 写权限；服务端 SHA allowlist 会拒绝未经接入更新的工作流，不能为了执行方便取消校验。更新工作流需重新核对 SHA/配置，旧结果不会自动沿用。

## 费用、等待与失败恢复

- 沿用 GitHub 免费额度与 Cloudflare Free；没有升级套餐的程序。接入时核对账户共享额度并配置 GitHub 超额停止。次数限制不等于账户账单上限，不承诺无限免费。
- 每 Owner 每 UTC 日最多启动 10 次检查（含重试），单工作流最多 8 分钟，任务领取窗口 30 分钟；不自动调用模型、重跑或重复 dispatch。已知失败可明确再次校验，每个版本/执行器最多 10 次。
- 丢失 dispatch 响应先按准确任务名、工作流 SHA 和创建时间寻找已有 run，不能因暂时没查到就再启动。不明确结果保留 unknown，禁止盲目重试；需核对准确运行。回传重复只接收相同报告。
- Orbit 在提案预览打开期间轮询小状态接口；关闭预览不停止任务，重新打开/刷新可恢复。后台完成后的最终 GitHub 状态在下次读取时核对，不要求新增 Cron、公开 webhook 或逐次手动 Run workflow。
- 身份失效、超额、执行器变化、基线变化或报告缺失都保持私有。自动化回归使用合成数据；只有接入后的一份真实提案成功领取、执行、回传和恢复，才能记为线上验收通过。

# 更新已经接入的私人 Worker

用于更新现有 `atlas-agent-private` 的代码。首次创建仍使用 `WORKER_SETUP.md`；已有线上身份、模型及私有数据库的 Worker 不应再次执行首次创建流程。

## 执行方式

代码经 PR 审阅、测试并获批合并后，在 GitHub Actions 运行 **Update private Atlas Worker**：

- Branch：`main`。
- `mode=plan` 只读核验；默认不写入。
- `mode=deploy` 先核验再更新代码，`confirmation` 填固定 Worker 名 `atlas-agent-private`。
- 沿用 `atlas-agent-bootstrap` Environment 的 Owner 审核和现有三项 Secret：`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_WORKER_API_TOKEN`、`ATLAS_D1_DATABASE_ID`。

不需要再次提交模型密钥。批准前可查看该次运行的源提交；运行会先从准确提交安装依赖、构建和执行完整私有运行时测试，再将凭据提供给唯一的云端更新步骤。push、PR 和公开 Pages 部署不会触发私人 Worker 更新。

## 保留与校验

Orbit 阅读联动版本须先等待同一提交的公开 Pages 部署成功，再更新 Worker；无需重新创建资源或迁移 D1。首次登录回跳与三种模式的账号验收见 [READING.md](READING.md)。

- 固定账号下只操作上述名称；D1 UUID 与数据库名必须匹配。缺失 Worker 返回错误，不会顺便创建。
- 只接受当前约定的 D1、身份 Secret、GitHub 只读 Secret、模型 Secret 和四项普通变量；拒绝其他资源绑定。
- 通过 Cloudflare `keep_bindings` 保留 `secret_text`、`plain_text`、`d1`，不读取 Secret 值，不用仓库模板中的 `MODEL_PROVIDER=disabled` 覆盖线上设置。
- 使用 Wrangler dry-run 的真实模块，仅上传入口和它引用的三个文本模块；不上传旧资产、source maps、配置或日志。
- 上传前再次比对设置，上传后核验绑定描述、模型普通变量、兼容设置、workers.dev/预览和 Cron 状态。不会调用修改 Access、域名、路由、定时任务、账单或数据库内容的 API。
- 保持当前预览和 Cron 关闭、日志关闭；保留 workers.dev 原状态。未知设置、漂移或不确定上传结果均停止，不自动重试、回滚、删除或重建。

这些检查不是云端原子比较交换；执行期间不要从控制台或其他终端并发修改配置或发布代码。Secret 值本身不可读，保留由 Cloudflare 的绑定保留机制完成，后置检查只核对绑定描述。成功结果只说明代码上传及配置核验完成，Owner 登录后的真实问答和候选保存仍须验收。

## Claude 草稿输出修复的验收

Claude JSON 回答和草稿共享 4,096 output tokens；输入仍限制 24 KB、每天调用和 token 上限仍按线上私有配置。Sonnet 5.5 使用 `between_tools` + medium effort，当前不提供工具，因此不进行作答前思考；其他模型不继承这个模型专用参数。Claude 请求允许 60 秒，低于会话锁 90 秒。

请求使用 `output_config.format` 的 JSON schema，同时继续执行本地引用、文章 ID、Domain 和候选归属校验。截断、拒答、上下文超限分别返回固定错误码。半成品不写成回答或候选，原问题和失败请求保留；失败预留仍不释放，相同请求 ID 不会重复调用，不自动拼接或续写付费请求。

Owner 可在修复上线后重新发起原先失败的问题，核对：完整回答、右侧私人候选、刷新恢复、原文跳转。它仍不能修改公开文章或创建发布批准。

官方依据：[Claude Sonnet 5.5 参数](https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide)、[结构化输出](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)、[结束原因](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons)、[Worker 上传及 keep_bindings](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/)。

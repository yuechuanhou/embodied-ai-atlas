# Atlas 运行验收与恢复

这里维护可重复的运行检查、部署依据和恢复方法。代码合并、Worker 更新、账号配置生效和真实入库验收分别判断；不为每次人工测试另建记录 PR。

## 1. 当前基线与尚待接入项

2026-11-24 已核对的生产基线为 PR #25 合并提交 `9240abe56e046555c3c616a85ce93b231dbc9f4b`：

- [Pages 45503747826](https://github.com/yuechuanhou/embodied-ai-atlas/actions/runs/45503747826) 成功，公开 manifest/index revision 和摘要一致，26 篇文章、41 个派生 Topic。
- [Worker 45504019837](https://github.com/yuechuanhou/embodied-ai-atlas/actions/runs/45504019837) 返回相同 source revision，`mutations=true`、`worker_code_updated_configuration_verified`；上传检查保留 bindings、模型、入口和 schedules。
- PR #25 的 [CI 45405771080](https://github.com/yuechuanhou/embodied-ai-atlas/actions/runs/45405771080) 两项通用检查成功。知识专属 job 在此工程分支按设计 skipped，不能当成真实知识 PR 已通过的证据。
- 私人学习、候选审阅、会话管理和三模式已部署。Owner 已确认电脑和手机基本功能，以及隔离 SQL 恢复与内容抽查通过；这不等于自动化云端恢复测试已实现，也不代表新版公开 PR 已验收。

| 接入门槛 | 判断方式 |
| --- | --- |
| main 保护 | 远端 Active、main 目标、空 bypass、准确三项必需检查；模板不会自动应用 |
| 公开基线 | `inspect-publication.js` 只读核对 main、公开 manifest/index 与正文摘要；不验证 Worker 或发布身份 |
| 当前 D1 | `inspect-storage.js` 只读核对实际迁移/必要对象、外键、quick_check 和当前书签；当前主线不要求历史可选私有执行器迁移 |
| GitHub 发布身份 | 尚待按 [接入指南](../runtime/PUBLICATION_SETUP.md) 安装和配置；代码部署不等于权限已接入 |
| 真实知识入库 | 尚待准确公开确认、真实 PR/CI、独立合并确认、Pages 与 Orbit 检索核对 |

真实检查失败保持失败/待核实；不自动迁移或降低门禁。公开输出仅含脱敏状态，不放私人正文、会话/候选 ID、账号 UUID、bookmark 或备份地址。Free 的 7 天恢复规划沿用 Owner 已确认套餐，定时清理尚未启用。

## 2. 一次小范围实机验收

使用专用、无私人技术材料的验收对话。多数步骤不调用模型；A4 若需要新建候选，最多用一次简短模型调用，也可复用本人的非敏感测试候选。不要为了测试删除真实学习会话或故意中断付费请求。

| ID | 操作 | 通过标准 |
| --- | --- | --- |
| A1 | 公开 Atlas 搜索 VIO，打开章节，点击该节「问 Orbit」，完成正常登录 | 回到同一文章/章节；公开站仍可不登录阅读；私人数据不出现于公开站 |
| A2 | 伴读 → 对话 → 研究 → 返回阅读；用标题打开列表并切换对话 | 当前会话和已保存消息不因模式切换改变；rename/pin 仍可用；手动换会话不强制改文章 |
| A3 | 写未发送问题，再读另一章节；使用「使用当前章节」及范围固定 | 写作时范围保留，只有明确动作覆盖；在同一页面切回对话可恢复输入；刷新不承诺恢复未发送文字 |
| A4 | 打开私人候选审阅，编辑测试文字、Domain/目标文章，保存后刷新 | 内容、版本和归属恢复；人工整理不会被后续模型自动覆盖；未查证候选不能伪装为已核验或已发布 |
| A5 | 导出测试候选 Markdown；核对原文引用在阅读区定位 | 导出准确的已保存版本并标明私人状态；没有公共 PR 或 GitHub 正文修改；历史引用版本不静默重写 |
| M1 | 手机上重复 A1、A2，打开键盘写一条未发送问题、长消息上下滚动 | 输入、发送/收起与返回原文可达；历史与候选浮层可退出；没有不可达控件或持续横向溢出 |

另外用无痕窗口查看私人入口：应进入 Access 身份入口或被拒绝，不能看到对话。错误账号、会话过期和弱网若实际出现，记录具体步骤，不发送验证码、Cookie 或完整 Access token。没有观察到的场景保留 pending。并发、失败幂等和真正删除的破坏性回归继续在隔离自动化测试中完成。

## 3. main 分支保护：个人仓库配置

[main-ruleset.json](main-ruleset.json) 是期望配置，放进仓库本身不会创建 GitHub 规则。实际已存在 main Ruleset；升级时只补缺项并保留其他现有设置，不重复创建规则或用旧模板覆盖新增参数。当前连接不含 Administration 写权限，由 Owner 在已登录 GitHub 中保存，再只读复核。

仓库 Settings → Rules → Rulesets，创建 Branch ruleset，按下表填写；也可使用 GitHub 的 JSON import 功能导入本文件，并逐项核对。先检查已有规则，避免重复建立矛盾规则。

| 设置 | 目标值 / 理由 |
| --- | --- |
| Name | `Atlas main - PR and required checks` |
| Enforcement | **Active**；Disabled/Evaluate 不视为门禁生效 |
| Target branches | 仅 `main`（JSON 为 `refs/heads/main`） |
| Bypass list | 空；不把管理员、Owner、App 或部署密钥列为日常绕过者 |
| Restrict deletions | 开启 |
| Block force pushes | 开启 |
| Require a pull request before merging | 开启 |
| Required approvals | **0**；当前单 Owner 仍可审阅并主动合并，不依赖无法完成的自我 approval |
| Code Owner / last-push approval | 关闭；后续多人或新 App 接入时另行设计 |
| Require conversation resolution | 开启 |
| Required status checks | `check`、`Validate private runtime from a clean checkout`、`Validate Orbit knowledge change` |
| Expected source | 三项均选择 GitHub Actions；实际 app/integration ID 为 `15368` |
| Require branches up to date | 开启 |
| Require successful deployment before merge | 不设；当前 Pages/Worker 在合并后部署，不能制造循环依赖 |
| Restrict updates / linear history / merge queue | 本轮不启用，保留现有合并方式 |

检查名称必须对应现有 `check.yml` 的 job，而不是工作流标题或只在 main 上运行的 `deploy` / `update`。普通工程 PR 跳过知识专属 job；Orbit 知识 PR 必须实际运行并成功，不能把 skipped 当作验收通过。如果 GitHub 不提供对应候选，先核对近期 PR 的检查记录，不选择错误同名检查，也不关闭门禁来迁就。

生效后通过只读 API/规则页面复核 Active、main 目标、空 bypass 和准确 checks；下一次正常 PR 应显示这些检查为 Required。不要通过强推或删 main 来“验证”。仓库管理员仍可编辑规则本身，这不是管理员不可绕过的组织权限隔离。

**范围限制：** PR + CI 并不等于“只有 Owner 能合并”。此零审批配置适合当前单 Owner 开发；未来给 GitHub App `Contents:write` 时，必须重新审阅其合并能力、具体版本批准与服务端执行边界，不得声称这个 JSON 已把未来 App 强制限制为只开 PR。

官方依据（2026-11-23 核对）：[Ruleset 规则](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)、[Ruleset REST](https://docs.github.com/en/rest/repos/rules)。

## 4. 只读检查已有 D1

经 Owner 审阅合并本轮后，在 Actions 运行 **Inspect private Atlas storage**，Branch=`main`，批准既有 `atlas-agent-bootstrap` Environment；没有 apply/deploy/restore 模式和 SQL 输入。

它使用该 Environment 已有的 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`（原 D1 凭据）与 `ATLAS_D1_DATABASE_ID`，不使用模型或 Worker 上传 token。先不带任何凭据运行 `inspect-publication.js`：只读远端 main 生效规则，确认三项检查来源/strict 设置和 PR/删除/强推保护，再核对 main 与公开 manifest/index、文章摘要及读取前后版本一致。bypass、Worker 版本和 App 身份不在此公共检查范围；它也不代替部署 job 和真实入库验收。此脚本可单独用 `node agent/runtime/scripts/inspect-publication.js` 运行。

随后存储检查仅执行：

1. GET 固定 UUID 的 D1 信息，核对名称及 `version=production`。
2. 四条固定只读 SQL：必要表/不可变触发器、实际迁移历史、外键检查、quick_check。所有跟踪迁移默认必需，仅历史未接入的 `0003_proposal_validation.sql` 可选。可选迁移已记录则验证其对象；未记录却残留对应对象、缺失必需项、重复或未知记录都停止。
3. GET 当前 Time Travel bookmark，只在内部检查存在性。

存储输出只有固定名称、通过状态、migration 数量及可选 schema 是否存在；公共基线另输出公开 revision/数量，不输出正文。不输出 UUID、token、bookmark、表内容、问题、候选或备份文件。失败只输出固定错误码，不打印上游响应正文；不会自动重试、迁移、修复、删除或创建资源。只读检查会占用少量数据库执行时间，应避开学习请求繁忙时运行。

凭据过期/权限不足时停止，先由 Owner 检查原凭据；无需扩大到 Workers、Access 或 Billing。将来若要轮换，可评估目标账号的 D1 Read 权限，轮换是独立凭据操作，不能把脚本固定 UUID 说成平台已强制单库权限。工作流复用原存储操作的 concurrency group，但不能阻止其他终端或控制台并发操作。

`storage_read_checks_passed` 只证明该时刻的读取和所列检查成功。它不比较所有 schema 字节，不证明外部备份可用，也不证明登录体验、套餐天数或恢复演练通过。

## 5. 恢复窗口与隔离演练

Cloudflare 对 production 后端 D1 自动提供 Time Travel：Workers Free 为 7 天，Workers Paid 为 30 天。Owner 已于 2026-11-23 确认使用 **Workers Free**，本轮按 **7 天**规划；仍需只读工作流核实 production 后端与书签。工作流不读取套餐，所以它的 `retention_window=not_inspected` 不会覆盖这项人工确认。**无需为本轮升级套餐**。不要把旧接入用 token 的有效期当作数据恢复窗口；若以后更换套餐，重新记录恢复窗口。

Time Travel 的 restore 会原地覆盖目标库，取消进行中的查询。本轮不运行生产恢复命令。Time Travel 目前也不能直接 fork 成新库；本轮隔离演练应走 SQL 导出 → 独立空 D1 导入，不能把原地 restore 当克隆操作。

### 准备：先明确具体范围

- 源：现有 `atlas-agent-private`，在 Owner 控制台核对准确 UUID；不复制到公开记录。
- 目标：新建的独立 `atlas-agent-recovery-YYYYMMDD`，准确 UUID 与生产不同；**没有 Worker binding、Access 应用、模型密钥或发布执行器**。
- 数据：真实导出含全部私人过程。由 Owner 在自己可信设备的加密存储保存；不放公开仓库、聊天、CI 日志、GitHub artifacts 或同步目录。密钥不在 D1，恢复 SQL 不代表恢复全部系统凭据。
- 时点：先停止发消息/整理候选，确认无进行中请求，暂停本人的并发控制台编辑。导出会阻塞其他库请求，选一个短维护窗口。
- 授权：列出源、目标、导出保留位置与期限后，单独确认真实数据导出和目标库创建。若现有账号配额/费用不可接受，先做本地恢复并明确云端演练仍 pending。

### 执行：由 Owner 的私有环境完成

1. 使用仓库锁定的 Wrangler，在原库身份核对后 `d1 export ... --remote --output=<私有绝对路径>`。使用专用、gitignored 的本地配置绑定准确 UUID；不要使用仓库的全零占位模板，不把 token 写到命令行。
2. 记录导出时间和 SHA-256；在私密记录中保留当前书签与导出前后各业务表计数。保持维护窗口，避免比较基线漂移；失败或产物不完整则停止。
3. 创建并核对独立空目标库，只将导出 SQL 导入该目标。不得把生产 binding 指向它，不得给它生产模型或发布凭据。
4. 对照源与目标：各业务表行数、migration 历史、必要不可变触发器、foreign_key_check、quick_check；在私有环境抽查一段已知测试对话及其候选、版本、来源和引用。含 SQL 的导入/查询输出留在本机，不回传原始内容。
5. 把结果记为 `cloud_export_import_drill_passed` 或 failed。完整性/行数相同不是内容逐字校验，需加上述抽样；该演练也不证明所有历史分钟的 Time Travel restore 已验收。
6. 结束后恢复本人正常使用。导出和副本按明确保留期处置；清理目标库是单独准确范围的删除操作，不自动执行。建议验证成功后尽快清理临时副本；独立加密导出可保留最近两份、最长 30 天，待 Owner 确认后采用，不启用定时任务。

如果将来需要真正恢复生产库，应先保存当前可恢复点、停止写入、核对准确目标和损失窗口，再审阅独立恢复操作。恢复后必须协调此前删除的私人数据，撤销恢复出来的旧批准、核对 jobs/请求的不明结果、重新同步公开知识；不能重放历史发布或重复计费。不能直接把恢复副本替换成生产库后让所有任务继续跑。

官方依据（2026-11-23 核对）：[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)、[导入与导出](https://developers.cloudflare.com/d1/best-practices/import-export-data/)、[Wrangler D1 命令](https://developers.cloudflare.com/d1/wrangler-commands/)。

## 6. 当前检查改动与下一步

本阶段更新只读运维脚本、相应模拟回归和接入说明，没有技术文章、运行时问答、云端资源或数据库迁移变更，不需要重新上传私人 Worker。合并后运行更新后的 **Inspect private Atlas storage**，在原 Environment 审核后核对公共基线和实际 D1；若旧 token 失效，停止后轮换准确 D1 凭据，不扩大权限。

然后按 [一次性发布接入](../runtime/PUBLICATION_SETUP.md) 配置仅安装 Atlas 的 GitHub App 和 Worker Secret，再做真实提案公开 PR、CI、独立确认合并、Pages/索引/检索验收。正常知识 PR 自动触发 CI；手动运行的是当前接入检查和程序部署，不能混为每篇文章都需要手工 Run workflow。

后续交付顺序见 [AGENT_ROADMAP.md](../../AGENT_ROADMAP.md)：主流程验收、Orbit 内发布确认、基础新文章，再接外部文档粘贴导入。架构建议仍只私有展示，带回设计对话决定；不建立第二个发布通道。

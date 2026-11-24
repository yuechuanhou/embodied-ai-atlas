# Orbit 单仓库公开提案

本轮提供“私人审阅 → 确认公开 → 自动 PR → 准确 CI 状态”。代码默认关闭，须完成 GitHub 身份配置、受保护 Worker 更新和真实 Owner 验收后才可使用。没有合并 API；`open_pr` 不授权合并或部署。

## 公开边界与检查顺序

1. 正常学习、候选与不可变私人提案沿用现有流程。仅支持已注册文章的精确末尾增补，不接受新文件、元数据、删除、改写原文或架构修改。
2. 打开“公开 PR 审阅”，查看拟公开文件全文、PR 标题/描述、分支和提交信息。本人确认新措辞的技术依据、行文及公开范围；页面明确说明创建公开分支/提交时正文即公开，测试失败也不能把它视为私人草稿。
3. `POST /api/proposals/:id/publication` 仅接收版本、私人提案摘要、公开投影摘要和三项明确确认。服务端从验证的 Owner 身份创建 15 分钟、仅 `open_pr` 的批准和幂等任务；不接受客户端 Owner、路径、正文、来源清单或批准对象。
4. 公共 payload 通过允许字段重新构造：准确正文 after-image、公开文章标题、固定 PR 描述和结构校验 receipt。不复制私人 envelope、候选/会话/来源 IDs、私人来源、编辑备注或模型理由。正文自身是否适合公开仍须本人审阅，不能靠自动字段过滤判断。
5. GitHub App 只安装现有 Atlas 仓库。控制器只创建确定性 `orbit/content-*` 分支、一个文章增补提交和 PR，不更新 main、不强推、不修改工作流、不合并。每次写入前重验批准、候选/提案版本、main 与规范；旧批准不做自动 rebase。每 Owner 滚动 24 小时最多 10 个公开 PR 任务。
6. 现有 `check.yml` 自动运行。新增 `Validate Orbit knowledge change` 从可信 PR base checkout 执行，读取公开 Git objects，核对单提交、准确 base、规范摘要、单个普通 Markdown 文件、完整 before/after 摘要和只追加范围，再复用 `agent/change_validation.py` 的语义、内容、构建、渲染门禁。它不接收 D1 私人提案、不伪造公开证据、不证明技术事实正确。
7. Orbit 从 GitHub 核对准确 PR/head、固定工作流路径、run 与三个成功 job，再显示“检查通过 · 待确认合并”。main、分支、PR 或候选变化会阻塞后续执行。页面只轮询小状态接口；当前没有合并按钮，仍需独立授权的后续发布流程。

公开确认包含所有拟公开的正文；私人来源引用不会自动变成公开引用。需要让读者查阅的资料应在实际正文中有合适的公开出处。公开 receipt 只有结构绑定字段，不承担证据核实或 Owner 身份证明。

## 配置与权限

沿用 Cloudflare Free、既有 D1 表与现有公开仓库，不新建校验仓库、机器 gateway 或数据库 migration。PR #24 的独立执行器接入工具不属于此路线。

GitHub App 的 repository permissions：Metadata:read（隐含）、Contents:write、Pull requests:write、Actions:read；仅选择 `yuechuanhou/embodied-ai-atlas`，不授予 Workflows/Administration/Actions 写权限。GitHub Contents 权限本身覆盖仓库，路径与操作白名单由确定性服务及 main 保护规则共同限制，不能声称 App 提供了 content/ 目录级授权。该权限需要 Owner 一次性明确安装，不能复用仅供读取的 token 或向模型提供凭据。

Worker Secrets：

- `PUBLICATION_APP_PRIVATE_KEY`：本地转换后的 PKCS#8 PEM，仅存服务端。
- `PUBLICATION_CONFIG`：准确接入后设置下列 JSON。默认缺失或 `enabled:false` 时，私人审阅和导出继续可用，创建 PR 被阻止。

```json
{
  "enabled": true,
  "repository": "yuechuanhou/embodied-ai-atlas",
  "repository_id": "1464728578",
  "owner_id": "115120514",
  "app_id": "<实际 App ID>",
  "installation_id": "<实际 installation ID>"
}
```

installation token 被进一步限定为上述准确仓库 ID 和权限，短期缓存，不进前端、模型或 CI。这里只读核对 Actions，不 dispatch workflow；PR 事件自然触发现有 CI。程序更新仍是手动批准的 `Update private Atlas Worker`，不与日常知识 PR 混淆。

## 状态、并发和恢复

复用 `approvals` 和 `jobs`，公开投影摘要、配置摘要及 GitHub 阶段标识持久保存在私人任务中。相同版本/摘要的重复请求返回同一任务，不创建第二份批准或 PR。D1 乐观锁阻止并行推进，写入前保存 `pending_action`，外部成功后才记录里程碑。

网络结果不明时仅以固定错误码停止，不自动重发、删除分支、回滚或调用模型。重新打开页面通过准确分支、单提交、公开正文摘要和 PR 内容只读核对；已完成阶段恢复后，可由本人明确继续原批准任务。查询不到结果不等于写入未发生，不盲目重试。批准到期、撤销或依据变化后停止对应写入；遗留公开分支/任务须单独核对，不能静默清理或重复公开。PR 已创建则可继续读取 CI，即使创建批准已过期；读取不赋予合并权。

任务显示 PR/检查阶段，不显示“已入库”或“已上线”。外部手动合并只标为外部操作，不推断部署或索引成功。启用创建 PR 前，将 main Ruleset 加入来自 GitHub Actions 的 `Validate Orbit knowledge change` 必需检查；现有 `check` 和 `Validate private runtime from a clean checkout` 保留。仓库内配置模板已更新，不代表远端设置已应用。普通工程 PR 跳过该知识专属 job；知识分支上跳过该 job 不会被 Orbit 当作通过。真实接入验收至少覆盖一份实际允许公开的文章增补、CI 回显、刷新恢复和后续人工确认；自动化回归仅使用合成材料。

# Orbit 发布身份：一次性接入

主线使用现有公开 Atlas 仓库和 Cloudflare Free，不创建私有校验仓库。
代码已在 PR #25 部署；以下是账号接入和真实功能验收，不是每天重复的操作。
正常知识 PR 由事件自动触发 CI，不需要逐篇 Run workflow。

## 1. 先核对运行基线

- 保留现有 main Ruleset，确认 Active、仅 main、Bypass list 为空、禁止删除/强推和必须 PR。
- 必需检查包含 `check`、`Validate private runtime from a clean checkout`、`Validate Orbit knowledge change`，来源均为 GitHub Actions，Require branches up to date 开启。
- 保存后重新打开规则，并用只读 API/脚本复核；只选择候选而未点击 Save changes 不会生效。
- 运行现有 **Inspect private Atlas storage**（main，批准既有 `atlas-agent-bootstrap`），应返回 `publication_read_checks_passed` 和 `storage_read_checks_passed`。
- 当前 D1 只应用 0001/0002 是有效主线；不要为此申请旧私有执行器、执行生产迁移或重建数据库。

公共检查不验证 bypass 和发布身份；这些在对应设置中核对。首次真实公开 PR 前完成当前 D1 检查；检查失败先处理准确问题，不自动修复。

## 2. 创建只服务 Atlas 的 GitHub App

在自己的已登录浏览器打开 [New GitHub App](https://github.com/settings/apps/new)。
如已有专用于 Orbit 发布的 App，先核对现有配置，不重复创建。

| 设置 | 值 |
| --- | --- |
| GitHub App name | `Orbit Atlas Yuechuanhou`，若重名可加个人后缀 |
| Homepage URL | `https://www.yuechuanhou.com/embodied-ai-atlas/` |
| Callback URL / Setup URL | 留空；当前不使用用户 OAuth 或回调 |
| Request user authorization / Device flow | 不启用 |
| Webhook Active | 关闭；当前读取 CI 状态，不接 webhook |
| Repository → Contents | Read and write |
| Repository → Pull requests | Read and write |
| Repository → Actions | Read-only |
| Metadata | Read-only，GitHub 自动授予 |
| Workflows / Administration / 其他权限 | 不授予 |
| Where can this GitHub App be installed? | Only on this account |

保存 App 后记录数字 **App ID**，不要把 Client ID 当作 App ID。
然后在 **Install App** 安装到本人账号，选择 **Only select repositories**，只勾选
`embodied-ai-atlas`。核对权限和目标后完成安装，记录安装设置页 URL 里的数字
**installation ID**，通常为 `/settings/installations/<数字>`。

Contents:write 是仓库级权限，GitHub 不提供本方案的 content/ 目录级授权。
实际路径、操作、版本和批准由服务端白名单限制；main 保护不赋予 App bypass。
不用 ChatGPT GitHub 连接或原只读 token 代替这个发布身份。

## 3. 生成私钥并直接放入 Worker

在该 App 的 **Credentials → Key pairs → New key** 生成并下载私钥；旧界面可能显示
**Private keys → Generate a private key**。下载文件通常为 PKCS#1；Worker 需要
PKCS#8。私钥只留本人可信电脑与 Cloudflare Secret，不发到聊天、GitHub、日志或模型。

Mac Terminal 中输入 `ATLAS_APP_PEM=`，先不回车，将刚下载的准确 `.pem` 文件拖进
终端，随后回车。变量只保存文件路径。然后运行：

```sh
chmod 600 "$ATLAS_APP_PEM"
openssl pkcs8 -topk8 -nocrypt -in "$ATLAS_APP_PEM" | pbcopy
```

命令将转换结果直接复制到剪贴板，不打印密钥。确认没有报错，再到 Cloudflare →
Workers & Pages → `atlas-agent-private` → Settings → Runtime variables and secrets：

1. Add variable，Type 选 **Secret**，Name=`PUBLICATION_APP_PRIVATE_KEY`，粘贴剪贴板，保存部署。
2. 新增第二个 **Secret** `PUBLICATION_CONFIG`。下列两个占位符必须换成刚核对的数字字符串；其他固定值保持：

```json
{
  "enabled": true,
  "repository": "yuechuanhou/embodied-ai-atlas",
  "repository_id": "1464728578",
  "owner_id": "115120514",
  "app_id": "替换为实际数字AppID",
  "installation_id": "替换为实际数字InstallationID"
}
```

保存后清空剪贴板：`printf '' | pbcopy`。不改现有 Access、Owner、模型、D1 bindings 或入口。
配置不存在或 `enabled:false` 时，仅可私人审阅/导出，创建 PR 关闭。
这次是更新既有 Worker Secrets，不需重新上传同一程序；后续程序更新器会保留这些 Secret。

## 4. 第一个真实知识 PR

1. 在 Orbit 同步知识，使用本人已查证、允许公开的短小测试候选，选择一个已有文章。不要为验收编造事实、贴入私人客户材料或复制未经核验的模型结论。
2. 候选核对与「准备提案」仍是私有；检查完整 before/after、出处支持范围和增补位置。
3. 打开「公开 PR 审阅」，核对拟公开全文、分支、提交及 PR 信息。明确确认后正文即进入公共 Git 历史，即使 CI 失败也已公开。
4. 等待自动创建一个 PR，并核对三项 CI 对准确 PR/head 实际成功。刷新 Orbit 应恢复同一任务和结果，不重复建 PR或调用模型。
5. 当前代码没有合并 API；单独确认后由 Owner 在 GitHub 或设计对话合并。随后核对 Pages 成功、实际页面新增正文、manifest/index revision/hash 和 Orbit 检索到新段落。

如果 main 已前进、候选/提案版本变化、批准过期或结果不明，停止并核对当前任务。
不自动 rebase、重试写入、删除分支或重用旧批准。真实 PR 失败按准确原因修复，不能把工程 PR 上 skipped 的知识 job 当作通过。

主闭环通过后才继续 [路线图](../../AGENT_ROADMAP.md) 中的 Orbit 内确认发布、基础新文章和外部文档导入。
本阶段不授予模型直接改架构、删除文章或合并发布的能力。

官方依据：[注册 GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)、
[最小权限](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)、
[管理 App 私钥](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps)、
[读取生效分支规则](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch)。

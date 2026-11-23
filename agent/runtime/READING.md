# Orbit：就地升级阅读契约

## 用户流程

公开 Atlas 继续独立提供导航、目录、搜索和完整文章，不要求登录。顶部或章节中的「问 Orbit」在同一标签进入已经验证的私人 Worker，先完成现有 Cloudflare Access 身份验证，再打开对应的原文、章节和导航视角。首次进入时地址会从公开域名切到私人 Worker 域名；这版没有更改 DNS 或把私人 API 移到公开域名。

登录后的阅读区复用正式公开站，私人会话和 API 始终位于顶层 Worker 的同源环境。不在公开站内嵌需要跨站 Cookie 的私人工作台，也不要求放宽浏览器 Cookie 或 Access 设置。部署前须核对 `manifest.site.private_agent_origin` 与 Worker 的实际身份配置相同；`ATLAS_AGENT_ORIGIN` 可以覆盖入口元数据，也可以设为空关闭公开入口。

- **伴读**：章节附近的小窗；手机显示底部伴读面板。
- **对话**：右侧阅读面板；窄屏使用完整对话页面，可收起回到原文。
- **研究**：保留完整工作台、所有会话、置顶、重命名、删除确认、候选和导出。
- 模式切换只调整同一份聊天 DOM，不创建新会话、不重新调用模型。收起后后台请求继续完成，重新展开可见保存结果。
- 对话标题可打开原有会话列表。前两种模式通过浮层管理会话，研究模式保留侧栏。手动换会话不强制跳转文章，未发送草稿按会话保留在当前页面内存中；不声称刷新后恢复未发送草稿。
- 阅读章节或文章变化只更新下一题的范围。开始撰写时固定本次引用；手动固定范围和「使用当前章节」提供明确覆盖。已发送请求在第一次异步操作前复制上下文，阅读变化和模式切换不得改写它。旧回答的引用和来源版本保持不变。
- 站内引用、候选的目标文章和 Topic 链接返回同一个阅读区。外部来源和用户显式选择新标签的操作继续使用普通链接。
- 私人 URL fragment 仅保存模式、当前会话 ID 和公开阅读地址，用于刷新恢复；不保存聊天、草稿、候选正文或密钥。旧 fragment 和已有会话兼容。

## 安全边界

私人页面仍要求 Owner Access JWT，保持 `frame-ancestors 'none'`、禁止公共缓存、精确 Origin 和自定义写操作请求头，不增加 CORS 或公开 API。唯一 CSP 扩展是允许加载固定公开 Atlas 的阅读 frame；frame 不能顶层导航，只有脚本、原始来源和普通弹出链接能力。

双向消息校验 `event.origin` **以及** `event.source`，使用版本化 `atlas-reader` 通道和明确类型，不使用通配目标来源。

- 公开阅读区到私人外壳：准备完成、公开阅读 ID、章节提问定位和主题。
- 私人外壳到公开阅读区：固定 Atlas 路径上的规范 URL、深浅主题。
- 会话 ID、消息、问题草稿、候选、鉴权信息从不发送到公开 frame。阅读消息不能发模型请求、修改会话、批准或发布内容。
- 模型调用仍使用已验证知识快照，并再次验证阅读 ID。消息通道本身不是知识权威或授权。
- frame 连接失败时明确显示重试和公开原文入口；研究模式与已保存对话仍可继续使用。

依据：[Cloudflare Access Cookie](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/)、[postMessage 来源校验](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)。

## 验证和上线顺序

先审阅 PR 并通过公开站、私人运行时和受保护上传 dry-run 检查。经 Owner 批准合并后，等待同一提交的 Pages 部署成功，再新建一次 `Update private Atlas Worker` 运行并批准环境。沿用既有云端设置，不需要数据库迁移、新 API key、CORS、DNS 或 Access 策略改动。

真实账号验收包括首次登录回到章节、三个模式与手机体验、切换文章不切会话、草稿范围、进行中请求、原文定位、刷新恢复，以及各模式下的 pin/rename/delete。该流程不等于知识正式入库；GitHub 写入和发布审批仍未上线。

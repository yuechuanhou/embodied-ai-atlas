> 这个网站采取 **content-as-code**：网页只是展示层，知识本体保存在独立 Markdown 文件中。

## 目录结构

```text
embodied-ai-atlas/
├── content/
│   ├── manifest.json        # 章节、导航、标签、关联
│   ├── overview.md           # 一个章节一份 Markdown
│   ├── data-taxonomy.md
│   ├── company-nvidia.md
│   └── ...
├── assets/
│   ├── site.css              # 全站视觉风格
│   └── site.js               # 搜索、导航、交互
├── build.py                  # 静态网站生成
├── requirements.txt
├── README.md
└── dist/
    └── index.html           # 单文件网页，可以直接打开
```

## 修改已有文章

只需编辑对应 `content/*.md`。例如要增加 VIO 数学推导，就改 `sensors-and-estimation.md`，或者将 VIO 拆成新的专题文章。

## 新增一个独立章节

1. 在 `content/` 下新增例如 `vio-deep-dive.md`。
2. 在 `content/manifest.json` 的 `pages` 增加一条记录：id、section、title、file、summary、tags 等。
3. 在相关文章添加指向新页面 ID 的内部链接（例如新增 `vio-deep-dive` 页面后，再建立引用）。
4. 运行 `python build.py`，生成更新后的 `dist/index.html`。

## 本地运行

```bash
pip install -r requirements.txt
python build.py
```

然后直接双击 `dist/index.html`，无需后端和本地服务器；中文搜索、章节切换、主题切换都可离线使用。引用的外部研究链接需联网访问。

## 迭代原则

- 一页尽量只覆盖一个连贯的知识单元；通过 Related Topics 链接跨页面连接。
- 公司数据保留 **报告日期、模型版本、原始来源、已知与未知**，不要悄悄把推测改成事实。
- 对术语先给一句话解释，逐步补充机制、数学、实现、trade-offs、研究前沿。
- 优先把新材料写到相应 Markdown；当主题自然长大后再拆成独立页面。
- 不强制学习顺序，也不设成绩/打卡/课程进度。

## 重要提醒

这个离线站点支持**浏览、搜索、阅读和源文件编辑**，但网页本身不是在线协作文档编辑器。修改 Markdown 后需要重新运行一次构建命令。后续如要多人协作、版本历史和一键发布，可以将整个源码目录放进 Git 仓库，使用 GitHub Pages / Cloudflare Pages 等静态托管服务。

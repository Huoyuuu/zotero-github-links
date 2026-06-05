# Zotero GitHub Links

在 Zotero 右侧 Item Pane 中新增一个可折叠栏目，自动显示论文关联的 GitHub 仓库链接。

## 功能

- 使用 `Zotero.ItemPaneManager.registerSection()` 注册原生 item pane section。
- 从条目 `url`、`extra` 字段提取 GitHub 仓库链接。
- 可选从 PDF 附件的 Zotero Fulltext 索引文本中提取链接，不需要手动打开 PDF。
- 自动去重，支持多个链接。
- 点击链接用 `Zotero.launchURL()` 打开。
- 提供复制全部链接、刷新/重新提取按钮。
- 根据 Zotero 当前语言显示英文或中文界面。
- 基于 item 与附件修改时间做轻量缓存。

## 安装

1. 构建插件：

```bash
npm install
npm run build
```

2. 在 `.scaffold/build/` 中找到生成的 `.xpi` 文件。
3. Zotero：`Tools` → `Add-ons`，拖入 `.xpi` 安装。

## 调试

- 使用模板脚手架：

```bash
npm run start
```

- 或在 Zotero 开发者模式中临时加载构建后的插件。
- 打开 Zotero Debug Output，可查看 `[Zotero GitHub Links]` 日志。

## 已知限制

- PDF 提取依赖 Zotero Fulltext 索引。如果 Zotero 当前版本的 Fulltext API 有变化，插件会降级为只读 metadata，并输出 debug 日志。
- 当前正则只匹配仓库根链接：`https?://github.com/owner/repo`，会忽略 query 参数和末尾标点。

## 未来计划

- 支持 GitLab、Bitbucket、Papers with Code。
- 增加右键菜单：写入 Extra 字段。
- 增加后台批量预索引/缓存。

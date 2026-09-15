# Tampermonkey Scripts

个人 Tampermonkey 脚本集合。点击脚本名即可安装（需先装 [Tampermonkey](https://www.tampermonkey.net/)）。

## Linux.do

- [linuxdo-auto-reader](https://raw.githubusercontent.com/ggvisPro/monkey/main/linuxdo-auto-reader.user.js) — 自动"阅读"帖子全部楼层，消灭未读小蓝点。
- [linuxdo-claude-orange-theme](https://raw.githubusercontent.com/ggvisPro/monkey/main/linuxdo-claude-orange-theme.user.js) — 把论坛主题色换成 Claude 暖橙色（纯 CSS）。
- [linuxdo-skip-external-link](https://raw.githubusercontent.com/ggvisPro/monkey/main/linuxdo-skip-external-link.user.js) — 自动点掉外部链接提示弹窗的"继续"。

## 115 网盘

- [115-force-old-ui](https://raw.githubusercontent.com/ggvisPro/monkey/main/115-force-old-ui.user.js) — 新版界面自动跳回旧版。
- [115-iina-play](https://raw.githubusercontent.com/ggvisPro/monkey/main/115-iina-play.user.js) — 在视频文件的悬浮菜单中添加 IINA 播放按钮，提取原画直链并跳转播放。
- [115-share-auto](https://raw.githubusercontent.com/ggvisPro/monkey/main/115-share-auto.user.js) — 自动同意协议、设长期有效、选访问码并复制分享文本。
- [115-series-organizer](https://raw.githubusercontent.com/ggvisPro/monkey/main/115-series-organizer.user.js) — 剧集归入/展平 Season 文件夹，按条件清理杂项。
- [115-tmdb-rename](https://raw.githubusercontent.com/ggvisPro/monkey/main/115-tmdb-rename.user.js) — 从 TMDB 拉剧集信息批量重命名文件/文件夹（API key 运行时输入）。
- [115-movie-wall](https://raw.githubusercontent.com/ggvisPro/monkey/main/115-movie-wall.user.js) — 把影视文件夹变成海报墙，海报来自 TMDB（token 运行时输入）。
- [hdhive-115-helper](https://raw.githubusercontent.com/ggvisPro/monkey/main/hdhive-115-helper.user.js) — 文件旁注入 HH 按钮，搜 HDHive 资源并解锁 115 链接。

## 好医生 / CME

- [haoyisheng-survey-autofill](https://raw.githubusercontent.com/ggvisPro/monkey/main/haoyisheng-survey-autofill.user.js) — 一键自动填充全员培训问卷。
- [haoyisheng-required-course-autoplay](https://raw.githubusercontent.com/ggvisPro/monkey/main/haoyisheng-required-course-autoplay.user.js) — 必修课视频自动播放，解除拖拽/倍速限制。
- [cmechina-cme-automation](https://raw.githubusercontent.com/ggvisPro/monkey/main/cmechina-cme-automation.user.js) — 自动填 CME 考试答案、跳过学习前置、连播下一节。

## 语雀

- [yuque-smart-table](https://raw.githubusercontent.com/ggvisPro/monkey/main/yuque-smart-table.user.js) — 在原生表格菜单添加“智能排版”，点击直接调整当前表格，支持多列与合并单元格。

### 语雀表格智能排版使用说明（v1.1.0）

**安装 / 更新：** 点击上方脚本链接，通过 Tampermonkey 安装；也可以在 Tampermonkey 中用 `yuque-smart-table.user.js` 的完整内容替换旧版并保存，再刷新语雀页面。

支持 `aliyuque.antfin.com`、`yuque.alibaba-inc.com`、`yuque.com` 及其子域名中的普通文档表格。独立电子表格、画布表格、跨域 iframe 内表格不在本版范围内。

1. 在语雀编辑态点击目标表格，打开原生浮动菜单。
2. **自适应宽度** 后新增 **智能排版**，点击即按当前内容直接调整当前表格。没有预览面板、悬浮启动按钮或二次确认。
3. 在原表查看效果，满意后自行更新文档。需要微调时使用语雀原有的列宽拖动功能。
4. 排版后同一菜单显示 **↶**，点击可恢复排版前列宽和自适应模式。连续排版保留首次操作前快照；刷新页面后快照失效。若你或协作者已再次修改列宽 / 自适应模式，恢复会拒绝覆盖。

默认使用均衡排版，按正文可用宽度分配；多列放不下则按内容宽度展开，保留横向滚动。每次点击都重新确定当前选中的表格，菜单重建时自动补回按钮，不向图片、代码等其他菜单注入。

脚本只执行原生列宽命令，不点击保存、更新或发布。**语雀可能自动保存草稿或实时协同同步。** 正文、图片、链接和合并关系不被重写；仅以简短提示反馈成功或失败。

### 自动布局方案

采用 **内容测量 + 上下限约束 + 剩余宽度分配**，没有硬编码四列比例，也不依赖 AI 或外部服务：

- 按实际字体测量文本，给短字段较小宽度，对长段落按目标换行数估算需求；默认均衡策略限制换行预算和列宽上限。
- 每列均匀抽样，并额外保留最长文本和含媒体的样本，避免只看表头或开头几行。默认最多约 100 个常规样本 / 列，另加长文本和媒体样本；单样本文字测量上限 8000 字符。
- 正确映射 `rowspan`、`colspan`、`rowspan=0`；跨列内容约束覆盖列的总宽度。嵌套表格不增加外层列数。
- 按内容需求分配空间，设置可读下限和长文本上限；最小总宽已超过正文时，按内容目标宽度展开并横向滚动，避免滚动状态下仍把说明列压得过窄。
- 仅分析页面当前已加载的表格内容。语雀若分段或虚拟加载，需要滚动到后续内容后重新计算。不复制表格，也不创建独立预览。
- 处理上限为 256 列、50000 个已加载单元格；超过时明确停止。结果是启发式排版，不承诺全局最优，可以手动微调。

参考方案：[AG Grid 按内容自动列宽与边界约束](https://www.ag-grid.com/javascript-data-grid/column-sizing/)、[Handsontable 抽样测宽](https://handsontable.com/docs/17.0/javascript-data-grid/column-width/)、[W3C 表格自动布局与合并约束](https://www.w3.org/TR/CSS2/tables.html#auto-table-layout)。未引入这些表格组件，也没有复制或替换语雀正文。

### 编辑器兼容与验证

编辑器适配依据语雀公开的 [Lakex Doc 1.71.0 运行时代码](https://gw.alipayobjects.com/render/p/yuyan_npm/@alipay_lakex-doc/1.71.0/umd/doc.umd.js)：从表格原生引用取得 renderer，使用 `tableColumnAdaptation` 和 `tableColumnWidth` 命令。写入独立列宽前关闭 `fitWidth`，避免原生自适应模式联动修改相邻列。接口属于内部实现，语雀升级后可能改变；检测不到兼容接口或无法唯一确定选中表格时，禁用按钮。多列对应多次原生命令，语雀撤销可能需要多步，优先使用本工具的恢复按钮。

已完成 Node / jsdom 测试：2、4、12、30、100 列；超宽滚动；合并单元格；末尾长内容采样；原生命令模拟应用与恢复；失败 / 无效回读；原生菜单注入；菜单重建去重；切换表格准确定位；不向其他菜单注入；不创建预览 UI。

本版菜单选择器已通过实际语雀编辑页读取核对（`.ne-card-toolbar`、`ne-card-toolbar-item-columnAdaptation` 以及 `ne-table-wrap.ne-table-focus`）。**实际语雀写入、撤销以及保存后刷新验证尚未完成**；本地模拟不等同于线上端到端验证。

[本地演示](./examples/yuque-smart-table-demo.html) 包含 4、12、30 列示例，每张表上方直接显示菜单。演示使用模拟编辑器，不会写入语雀。

测试命令（依赖仅装到临时目录）：

```bash
npm install --prefix /tmp/yuque-layout-tests --no-audit --no-fund jsdom@26.1.0
NODE_PATH=/tmp/yuque-layout-tests/node_modules node --test tests/yuque-smart-table.test.cjs
node --check yuque-smart-table.user.js
```

## 其它


---

仓库地址：<https://github.com/ggvisPro/monkey>

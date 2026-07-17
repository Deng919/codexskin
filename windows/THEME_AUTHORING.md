# Windows 主题制作流程

本文记录仓库中两套 Windows 成品主题实际采用的生产流程。目标是让新增主题只提供数据和图片，不复制注入脚本、不修改 Codex 官方安装目录，也不破坏会话、插件、宠物窗口和原生交互。

## 成品结构

每套主题都是 `windows/themes/<theme-id>/` 下的独立目录：

```text
themes/<theme-id>/
├── theme.json
├── hero.png
├── texture.png
└── assets/
    └── character.png  # 可选
```

- `hero`：固定在主窗口底层的 16:9 场景图。
- `texture`：低透明度叠加纹理；不需要纹理时也提供透明 PNG。
- `character`：可选的透明人物前景。原图已经包含人物时直接省略该字段，不创建占位文件。
- `theme.json`：主题 ID、快捷方式名称、资源路径、语义色和背景裁切参数。

## 图片准备

1. 优先使用 16:9 横图，推荐 `2560x1440` 或 `3840x2160`。
2. 单张资源必须小于 `16 MiB`；不要为了体积盲目降质，先移除无用 Alpha 和元数据。
3. 左侧保留稳定的文字阅读区，人物或视觉主体放在中右侧。
4. 图片中不要嵌入 UI 文案、Logo 或按钮，所有交互继续使用 Codex 原生控件。
5. 如果使用透明人物层，必须检查白边、棋盘格残留、断发、裁肩和多个窗口比例下的裁切。

仓库中的两种构图代表两条可靠路径：

- `xuanjia-chijin`：无人物场景底图 + 透明人物层。
- `blue-night-red-eyes`：人物已在 4K 场景图中，不配置额外人物层。

## 配置主题

`theme.json` 示例：

```json
{
  "schemaVersion": 1,
  "id": "blue-night-red-eyes",
  "shortcutName": "冷蓝红瞳",
  "name": "Blue Night Red Eyes",
  "hero": "hero.png",
  "texture": "texture.png",
  "colors": {
    "background": "#020817",
    "panel": "#071326",
    "panelAlt": "#0B1D36",
    "accent": "#176CA4",
    "gold": "#8ED8FF",
    "text": "#EDF7FF",
    "muted": "#93ABC2",
    "line": "#24557A",
    "link": "#71CFFF",
    "code": "#A7D8FF",
    "quote": "#84BFE5",
    "success": "#61C7A5",
    "warning": "#E7C66D",
    "danger": "#FF7F8E",
    "diffAdded": "#4DB99B",
    "diffRemoved": "#E06B7A"
  },
  "layout": {
    "heroSize": "cover",
    "heroPosition": "50% 50%",
    "textureOpacity": 0.05
  }
}
```

颜色字段必须表达用途，而不是某个主题的固定颜色。共享 CSS 只引用 `--theme-*` 变量，因此切换主题时建议卡、项目选择器、输入框、按钮、边框、滚动条和正文语义色会一起换色。

- `link`：正文链接、文件名、路径和 inline mention。
- `code`：行内代码；代码块继续保留 Codex 官方语法高亮，只使用主题面板色和边框色。
- `quote`：引用块文字与左边框。
- `success`、`warning`、`danger`：运行状态和提示反馈。
- `diffAdded`、`diffRemoved`：diff 行及 Codex 原生语义色。

这些扩展语义色对旧的 schema v1 主题兼容。旧主题未配置时会从 `gold`、`muted` 和 `accent` 等基础字段推导；新主题应显式配置，以保证切换后正文颜色真正体现主题差异。

## 安装与热切换

安装器会自动扫描所有包含 `theme.json` 的主题目录，并为每套主题生成快捷方式：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\install-dream-skin.ps1 -ThemeId blue-night-red-eyes
```

运行中的 Codex 可以直接热切换：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\switch-dream-skin.ps1 -ThemeId xuanjia-chijin -Port 9335 -RestartExisting
```

切换脚本会完成三件事：

1. 更新 `windows/active-theme.txt`。
2. 用主题语义色更新 Codex 官方基础深色配置。
3. 只重启 CDP 注入守护进程；已经通过 `9335` 运行的 Codex 主程序不会重启。

若 Codex 是普通方式启动且没有调试端口，`-RestartExisting` 才会关闭并重新激活 Store 应用。

## 验证流程

每套主题至少验证以下状态：

1. 新建任务首页：背景、四张原生建议卡、项目选择器和 composer。
2. 普通会话页：长文本、代码块、命令状态和右侧环境面板。
3. `1280x800` 与 `1600x900`：无横向溢出、文字不遮挡人物关键部位。
4. 页面 reload：守护进程能自动恢复主题。
5. 宠物窗口：`avatar-overlay` 目标不注入主题，`html/body` 保持透明。
6. 双向切换：主题 ID、语义色、背景资源和 `active-theme.txt` 同步变化。

自动化命令：

```powershell
node --test windows/tests/*.test.mjs
python -m unittest discover -s windows/tests -p "test_*.py" -v
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\verify-dream-skin.ps1 -Port 9335 -ScreenshotPath <absolute-png>
```

本机 Python 自动化使用 `D:\CodexTools\python\Scripts\python.exe`。所有截图通过 CDP 直接捕获真实 Codex 窗口，不使用静态 UI 模拟图。

## 安全与发布

- 不修改、替换或取得 `WindowsApps`、`app.asar` 和官方签名文件的所有权。
- CDP 只连接 `127.0.0.1`，不要暴露到局域网。
- 新主题只能引用自己目录内的 PNG、JPEG 或 WebP。
- 发布前运行 `git diff --check`、Node 测试、Python 资产测试，并检查首页与会话页最终截图。
- 公开发布人物或 IP 图像前，自行确认版权、肖像权和商标授权。

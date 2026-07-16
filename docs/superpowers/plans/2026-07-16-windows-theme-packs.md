# Windows 数据驱动主题包实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Windows 版增加安全、可切换的数据驱动主题包，并交付不修改 Codex 文案的“玄甲赤金”主题。

**Architecture:** 将主题读取与校验拆到独立 Node 模块，启动脚本只负责解析主题目录，注入器负责把主题配置和本地图片编码进渲染载荷。渲染端只设置 CSS 变量和无文字装饰，原生 Codex DOM 文案保持不变。

**Tech Stack:** PowerShell 5.1、Node.js ESM、`node:test`、CDP、CSS 自定义属性。

---

## 文件结构

- 新建 `windows/scripts/theme-loader.mjs`：主题规范校验、路径限制、图片读取和数据 URL 构建。
- 新建 `windows/tests/theme-loader.test.mjs`：主题加载安全与载荷测试。
- 新建 `windows/tests/visual-contract.test.mjs`：防止重新引入 Fiona 文案、粉紫硬编码和有文字装饰层。
- 修改 `windows/scripts/injector.mjs`：接受 `--theme-dir`，使用主题加载模块。
- 修改 `windows/scripts/start-dream-skin.ps1`：接受 `-ThemeId`，解析 `active-theme.txt` 并传给注入器。
- 修改 `windows/scripts/install-dream-skin.ps1`：生成带主题参数的快捷方式，并使用赤金基础色。
- 修改 `windows/assets/renderer-inject.js`：注入主题变量与无文字装饰。
- 修改 `windows/assets/dream-skin.css`：移除粉紫硬编码，使用主题变量并优化人物裁切。
- 新建 `windows/themes/xuanjia-chijin/`：`theme.json`、`hero.png`、`texture.png`。
- 新建 `windows/active-theme.txt`：默认值 `xuanjia-chijin`。

### Task 1：主题加载器安全边界

**Files:**
- Create: `windows/tests/theme-loader.test.mjs`
- Create: `windows/scripts/theme-loader.mjs`

- [ ] **Step 1：先写失败测试**

使用 `node:test` 创建临时主题目录，覆盖有效主题、缺字段、路径穿越、非法颜色、缺图和超限图片：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadTheme } from "../scripts/theme-loader.mjs";

test("rejects image traversal outside the theme directory", async () => {
  const dir = await makeTheme({ hero: "../secret.png" });
  await assert.rejects(loadTheme(dir), /must stay inside its theme directory/);
});

test("loads a valid visual-only theme", async () => {
  const dir = await makeTheme();
  const loaded = await loadTheme(dir);
  assert.equal(loaded.theme.id, "xuanjia-chijin");
  assert.equal(loaded.theme.layout.heroPosition, "58% 36%");
});
```

- [ ] **Step 2：运行测试并确认因模块不存在而失败**

Run: `node --test windows/tests/theme-loader.test.mjs`

Expected: FAIL，错误包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3：实现最小加载器**

导出 `loadTheme(themeDir)` 和 `buildThemePayload(themeDir)`。只接受 `schemaVersion: 1`、合法主题 ID、六位十六进制色值、受限布局字段，以及主题目录内不超过 16 MiB 的 PNG/JPEG/WebP 文件。

```js
export async function loadTheme(themeDir) {
  const root = path.resolve(themeDir);
  const raw = JSON.parse(await fs.readFile(path.join(root, "theme.json"), "utf8"));
  if (raw.schemaVersion !== 1) throw new Error("unsupported theme schema");
  for (const key of ["hero", "texture"]) {
    if (path.basename(raw[key]) !== raw[key]) {
      throw new Error(`${key} must stay inside its theme directory`);
    }
  }
  return validateAndRead(root, raw);
}
```

- [ ] **Step 4：运行测试确认通过**

Run: `node --test windows/tests/theme-loader.test.mjs`

Expected: 全部 PASS。

- [ ] **Step 5：提交**

```powershell
git add windows/scripts/theme-loader.mjs windows/tests/theme-loader.test.mjs
git commit -m "feat(windows): add secure theme package loader"
```

### Task 2：注入器与启动脚本接入主题目录

**Files:**
- Modify: `windows/scripts/injector.mjs`
- Modify: `windows/scripts/start-dream-skin.ps1`
- Modify: `windows/scripts/install-dream-skin.ps1`
- Create: `windows/active-theme.txt`

- [ ] **Step 1：扩展失败测试**

在加载器测试中断言 `buildThemePayload()` 返回主题 JSON、主图数据 URL 和纹理数据 URL，且没有读取主题目录外文件。

- [ ] **Step 2：运行测试确认新断言失败**

Run: `node --test windows/tests/theme-loader.test.mjs`

Expected: FAIL，提示 `buildThemePayload` 或返回字段不存在。

- [ ] **Step 3：实现载荷并接入注入器**

`injector.mjs` 增加 `--theme-dir` 参数，将三个占位符替换为 JSON 字面量：

```js
const payload = template
  .replace("__DREAM_CSS_JSON__", JSON.stringify(css))
  .replace("__DREAM_HERO_JSON__", JSON.stringify(heroDataUrl))
  .replace("__DREAM_TEXTURE_JSON__", JSON.stringify(textureDataUrl))
  .replace("__DREAM_THEME_JSON__", JSON.stringify(theme));
```

`start-dream-skin.ps1` 验证主题 ID 只包含 `[a-z0-9-]`，解析出的绝对目录必须位于 `windows/themes` 下，然后把同一主题目录传给守护注入、验证和状态记录。

- [ ] **Step 4：运行加载器测试和脚本语法检查**

Run: `node --test windows/tests/theme-loader.test.mjs`

Run: PowerShell Parser 检查 `windows/scripts/*.ps1`。

Expected: 全部通过，PowerShell 解析错误为 0。

- [ ] **Step 5：提交**

```powershell
git add windows/scripts/injector.mjs windows/scripts/start-dream-skin.ps1 windows/scripts/install-dream-skin.ps1 windows/active-theme.txt windows/tests/theme-loader.test.mjs
git commit -m "feat(windows): load active theme packages"
```

### Task 3：视觉契约与数据驱动渲染

**Files:**
- Create: `windows/tests/visual-contract.test.mjs`
- Modify: `windows/assets/renderer-inject.js`
- Modify: `windows/assets/dream-skin.css`

- [ ] **Step 1：先写视觉契约失败测试**

```js
test("renderer adds no visible theme copy", async () => {
  const renderer = await read("assets/renderer-inject.js");
  assert.doesNotMatch(renderer, /薛凯琪|Fiona Sit|专属定制皮肤/);
  assert.doesNotMatch(renderer, /textContent\s*=\s*THEME/);
});

test("skin has no hard-coded pink-purple palette", async () => {
  const css = await read("assets/dream-skin.css");
  assert.doesNotMatch(css, /--dream-pink|#ff73bd|#a14fe0|#cf61f0/i);
  assert.match(css, /--theme-accent/);
});
```

- [ ] **Step 2：运行测试并确认因现有 Fiona/粉紫代码而失败**

Run: `node --test windows/tests/visual-contract.test.mjs`

Expected: FAIL，列出现有硬编码文案和颜色。

- [ ] **Step 3：实现主题变量与无文字装饰**

渲染器只设置 `--theme-*`、`--dream-hero` 和 `--dream-texture`。装饰 DOM 仅保留金属角线、雪点和边框节点，不包含 `<span>` 文案。CSS 使用主题变量设置侧栏、主区域、卡片、输入框和按钮；横幅使用 `background-size: var(--theme-hero-size)` 与 `background-position: var(--theme-hero-position)`，左侧只添加可调暗色遮罩。

- [ ] **Step 4：运行视觉契约测试**

Run: `node --test windows/tests/visual-contract.test.mjs`

Expected: 全部 PASS。

- [ ] **Step 5：提交**

```powershell
git add windows/assets/renderer-inject.js windows/assets/dream-skin.css windows/tests/visual-contract.test.mjs
git commit -m "feat(windows): render visual-only theme variables"
```

### Task 4：玄甲赤金主题素材与配置

**Files:**
- Create: `windows/themes/xuanjia-chijin/theme.json`
- Create: `windows/themes/xuanjia-chijin/hero.png`
- Create: `windows/themes/xuanjia-chijin/texture.png`

- [ ] **Step 1：生成辅助纹理**

以用户图片作为风格参考，生成无人物、无文字、无徽标、无水印的横版黑化金属/红漆/古金纹理。保存到主题目录，不覆盖用户原图。

- [ ] **Step 2：创建主题配置**

```json
{
  "schemaVersion": 1,
  "id": "xuanjia-chijin",
  "name": "玄甲赤金",
  "hero": "hero.png",
  "texture": "texture.png",
  "colors": {
    "background": "#100D0E",
    "panel": "#171214",
    "panelAlt": "#211719",
    "accent": "#9F252B",
    "accentAlt": "#C44338",
    "gold": "#B89352",
    "text": "#F2ECE4",
    "muted": "#A79B95",
    "line": "#6D4A32"
  },
  "layout": {
    "heroSize": "cover",
    "heroPosition": "58% 36%",
    "heroOverlayStrength": 0.72,
    "textureOpacity": 0.12
  }
}
```

- [ ] **Step 3：运行主题加载测试验证真实主题包**

Run: `node --test windows/tests/theme-loader.test.mjs windows/tests/visual-contract.test.mjs`

Expected: 全部 PASS。

- [ ] **Step 4：提交**

```powershell
git add windows/themes/xuanjia-chijin windows/active-theme.txt
git commit -m "feat(windows): add xuanjia chijin theme"
```

### Task 5：真实 Codex 验收与安装更新

**Files:**
- Modify when needed: `windows/themes/xuanjia-chijin/theme.json`
- Modify when needed: `windows/assets/dream-skin.css`
- Create: `D:\Downloads\Codex-Dream-Skin-Xuanjia-QA-2026-07-16.png`

- [ ] **Step 1：执行完整静态验证**

Run: Node 全部测试、Node 语法检查、PowerShell Parser、`git diff --check`。

Expected: 0 失败、0 解析错误、0 空白错误。

- [ ] **Step 2：启动隔离 Codex 配置**

使用 `D:\Cache\CodexDreamSkin\xuanjia-qa-profile` 和空闲回环端口启动，不关闭当前 Codex。

- [ ] **Step 3：运行 CDP 验证并保存截图**

检查注入标记、原生侧栏、输入框、建议卡、装饰层 `pointer-events: none` 和页面无溢出。

- [ ] **Step 4：视觉检查并迭代裁切**

人物面部、头饰、肩甲和上半身必须可见；原生文字不得压住面部。必要时只调整 `heroPosition`、遮罩强度和响应式 CSS，然后重新截图。

- [ ] **Step 5：重新运行安装脚本并清理 QA 环境**

更新快捷方式与基础色，停止隔离实例，删除 `D:\Cache\CodexDreamSkin\xuanjia-qa-profile`，保留最终 QA 截图。

- [ ] **Step 6：最终提交**

```powershell
git add windows docs
git commit -m "feat(windows): ship data-driven xuanjia theme"
```

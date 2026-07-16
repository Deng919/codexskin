# 玄甲赤金 Windows 主题 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已确认的 Cockpit 首页/任务页概念图实现为可切换、可回退、无文案注入的 Windows Codex 玄甲赤金主题。

**Architecture:** 保留现有 CDP 注入与主题包加载器，将主题包从“场景图 + 纹理”扩展为“场景图 + 透明人物 + 头像 + 纹理”。renderer 只识别首页/任务页、设置 CSS 变量和无文字装饰类；CSS 负责 macOS 示例同构的首页几何、任务页壁纸与原生组件材质，所有真实文字和交互继续来自 Codex DOM。

**Tech Stack:** PowerShell 5.1、Node.js ESM、`node:test`、Python 3 + Pillow、Chromium DevTools Protocol、CSS 自定义属性。

---

## 文件结构

- 修改 `windows/scripts/theme-loader.mjs`：校验并读取 `character`、`avatar` 两个新增本地图片字段。
- 修改 `windows/scripts/injector.mjs`：向 renderer 传入四种图片数据，扩展任务页和多视口验证。
- 修改 `windows/assets/renderer-inject.js`：管理首页/任务页类、头像装饰和完整清理，不写可见文字。
- 重写 `windows/assets/dream-skin.css` 的视觉部分：首页、侧栏、建议卡、输入框、任务页和响应式规则。
- 修改 `windows/themes/xuanjia-chijin/theme.json`：声明透明人物与头像资产，并把 `hero.png` 改为无人物战场场景。
- 保留 `windows/themes/xuanjia-chijin/assets/xuanjia-character-cutout.png`：已确认的 RGBA 人物源资产。
- 新建 `windows/themes/xuanjia-chijin/assets/xuanjia-avatar.png`：从源人物确定性裁出的 `512x512` 头像。
- 新建 `windows/scripts/build_xuanjia_assets.py`：构建头像并验证图片模式、尺寸和 Alpha。
- 新建 `windows/tests/test_xuanjia_assets.py`：头像构建单元测试。
- 修改 `windows/tests/theme-loader.test.mjs`、`windows/tests/visual-contract.test.mjs`、`windows/tests/injector-theme-contract.test.mjs`：主题资产、无文案、路由类和验证契约。
- 修改 `windows/scripts/verify-dream-skin.ps1`：支持 `-Viewport WIDTHxHEIGHT`。
- 修改 `windows/references/qa-inventory.md`：替换过时的 Fiona 验收项，记录首页/任务页和三视口检查。

### Task 1: 扩展主题包图片契约

**Files:**
- Modify: `windows/tests/theme-loader.test.mjs`
- Modify: `windows/tests/injector-theme-contract.test.mjs`
- Modify: `windows/tests/visual-contract.test.mjs`
- Modify: `windows/scripts/theme-loader.mjs`
- Modify: `windows/scripts/injector.mjs`
- Modify: `windows/assets/renderer-inject.js`

- [ ] **Step 1: 先写四资产失败测试**

在 `baseTheme()` 中加入：

```js
character: "assets/xuanjia-character-cutout.png",
avatar: "assets/xuanjia-avatar.png",
```

让 `makeTheme()` 创建 `assets` 目录和两个测试文件，并新增：

```js
test("builds data URLs for all local theme images", async (t) => {
  const root = await makeTheme();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const payload = await buildThemePayload(root);
  assert.match(payload.heroDataUrl, /^data:image\/png;base64,/);
  assert.match(payload.textureDataUrl, /^data:image\/png;base64,/);
  assert.match(payload.characterDataUrl, /^data:image\/png;base64,/);
  assert.match(payload.avatarDataUrl, /^data:image\/png;base64,/);
});

test("rejects character traversal outside the theme directory", async (t) => {
  const root = await makeTheme({ character: "../character.png" });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(loadTheme(root), /character must stay inside its theme directory/);
});
```

在两个契约测试中断言 `__DREAM_CHARACTER_JSON__`、`__DREAM_AVATAR_JSON__`、`--dream-character`、`--dream-avatar` 存在。

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node --test windows/tests/theme-loader.test.mjs windows/tests/injector-theme-contract.test.mjs windows/tests/visual-contract.test.mjs
```

Expected: FAIL，缺少 `characterDataUrl`、`avatarDataUrl` 和相应占位符。

- [ ] **Step 3: 实现加载器与载荷扩展**

在 `loadTheme()` 中按现有 `validateImageName()` / `readImage()` 路径加入两个字段，保持 16 MiB、扩展名和路径穿越规则一致：

```js
const theme = {
  schemaVersion: 1,
  id,
  name: requireText(raw.name, "name", 80),
  hero: requireText(raw.hero, "hero", 120),
  texture: requireText(raw.texture, "texture", 120),
  character: requireText(raw.character, "character", 120),
  avatar: requireText(raw.avatar, "avatar", 120),
  colors,
  layout: {
    heroSize: requireHeroSize(layoutInput.heroSize),
    heroPosition: requireHeroPosition(layoutInput.heroPosition),
    heroOverlayStrength: requireUnitInterval(layoutInput.heroOverlayStrength, "layout.heroOverlayStrength"),
    textureOpacity: requireUnitInterval(layoutInput.textureOpacity, "layout.textureOpacity"),
  },
};

const descriptors = Object.fromEntries(
  ["hero", "texture", "character", "avatar"].map((key) => [
    key,
    validateImageName(theme[key], key),
  ]),
);
const [hero, texture, character, avatar] = await Promise.all(
  ["hero", "texture", "character", "avatar"].map((key) =>
    readImage(root, descriptors[key], key),
  ),
);
return { root, theme, hero, texture, character, avatar };
```

`buildThemePayload()` 返回四个 data URL。`injector.mjs` 的模板替换加入：

```js
.replace("__DREAM_CHARACTER_JSON__", JSON.stringify(themePayload.characterDataUrl))
.replace("__DREAM_AVATAR_JSON__", JSON.stringify(themePayload.avatarDataUrl))
```

`renderer-inject.js` IIFE 参数增加 `characterDataUrl`、`avatarDataUrl`，并创建/撤销对应 object URL。

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
node --test windows/tests/theme-loader.test.mjs windows/tests/injector-theme-contract.test.mjs windows/tests/visual-contract.test.mjs
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交主题资产契约**

```powershell
git add windows/scripts/theme-loader.mjs windows/scripts/injector.mjs windows/assets/renderer-inject.js windows/tests/theme-loader.test.mjs windows/tests/injector-theme-contract.test.mjs windows/tests/visual-contract.test.mjs
git commit -m "feat(windows): load layered theme artwork"
```

### Task 2: 构建无人物场景与头像资产

**Files:**
- Create: `windows/scripts/build_xuanjia_assets.py`
- Create: `windows/tests/test_xuanjia_assets.py`
- Create: `windows/themes/xuanjia-chijin/assets/xuanjia-avatar.png`
- Replace: `windows/themes/xuanjia-chijin/hero.png`
- Modify: `windows/themes/xuanjia-chijin/theme.json`

- [ ] **Step 1: 写头像构建失败测试**

```python
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_xuanjia_assets import build_avatar


class AvatarBuildTest(unittest.TestCase):
    def test_builds_512_rgba_avatar_with_transparent_corners(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.png"
            out = root / "avatar.png"
            Image.new("RGBA", (1672, 941), (120, 30, 20, 0)).save(source)
            build_avatar(source, out)
            avatar = Image.open(out)
            self.assertEqual(avatar.mode, "RGBA")
            self.assertEqual(avatar.size, (512, 512))
            self.assertEqual(avatar.getpixel((0, 0))[3], 0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 运行测试确认模块缺失**

Run:

```powershell
& 'D:\CodexTools\python\Scripts\python.exe' -m unittest discover -s windows/tests -p 'test_xuanjia_assets.py' -v
```

Expected: FAIL，无法导入 `build_xuanjia_assets`。

- [ ] **Step 3: 实现确定性头像裁切**

`build_xuanjia_assets.py` 使用固定裁切框保留脸、头冠和龙纹肩甲，不调用生成模型：

```python
from __future__ import annotations

import argparse
from pathlib import Path
from PIL import Image, ImageOps

AVATAR_CROP = (620, 0, 1250, 630)


def build_avatar(source: Path, output: Path) -> None:
    image = Image.open(source).convert("RGBA")
    if image.size != (1672, 941):
        raise ValueError(f"unexpected character size: {image.size}")
    crop = image.crop(AVATAR_CROP)
    avatar = ImageOps.fit(crop, (512, 512), Image.Resampling.LANCZOS)
    output.parent.mkdir(parents=True, exist_ok=True)
    avatar.save(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--avatar", type=Path, required=True)
    args = parser.parse_args()
    build_avatar(args.source, args.avatar)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 生成并检查头像**

Run:

```powershell
& 'D:\CodexTools\python\Scripts\python.exe' windows/scripts/build_xuanjia_assets.py --source windows/themes/xuanjia-chijin/assets/xuanjia-character-cutout.png --avatar windows/themes/xuanjia-chijin/assets/xuanjia-avatar.png
```

Expected: `xuanjia-avatar.png` 为 `512x512` RGBA；脸、完整头冠和龙纹肩甲位于安全区内。

- [ ] **Step 5: 用 Cockpit 生成无人物战场底图**

使用同目录参考图和当前 Cockpit wrapper，输出先写入 `D:\Downloads\Codex-Dream-Skin-Xuanjia-Concept-2026-07-16\xuanjia-scene-source.png`。提示词必须包含：保持雪山、军阵、旗帜、帐篷和右上冷光；彻底移除中央人物、披风、剑和所有人物残影；不含文字、水印和 UI；左侧较暗、右侧较亮；不得生成新的主角。

Run:

```powershell
$scenePrompt = @'
Create a clean environment plate from the reference artwork for use behind a separate transparent character layer in a desktop application theme. Preserve the snowy mountain battlefield, distant soldiers, red banners, tent structures, stairs, atmospheric depth and cold upper-right light. Completely remove the central female warrior, her hair, crown, armor, cape, sword, chains, tassels and every character-shaped remnant. Fill the removed area naturally with battlefield scenery. Keep the left half calmer and darker for UI readability and the right half brighter with distant snow and structures. No new hero character, no close foreground person, no text, no symbols added, no watermark, no UI, no checkerboard, no blur wash. High-detail cinematic painted environment, 1536x1024 landscape.
'@
powershell -NoProfile -ExecutionPolicy Bypass -File 'D:\CodexTools\gpttoimage-session\generate-current-account.ps1' -Prompt $scenePrompt -Out 'D:\Downloads\Codex-Dream-Skin-Xuanjia-Concept-2026-07-16\xuanjia-scene-source.png' -Size '1536x1024' -Quality 'high' -Reference 'D:\Downloads\Codex-Dream-Skin-Xuanjia-Concept-2026-07-16\references\warrior-original.png'
```

检查无人物残影后复制为 `windows/themes/xuanjia-chijin/hero.png`；概念图本身不得作为应用背景。

- [ ] **Step 6: 更新主题清单并验证资源**

在 `theme.json` 加入：

```json
"character": "assets/xuanjia-character-cutout.png",
"avatar": "assets/xuanjia-avatar.png"
```

Run:

```powershell
& 'D:\CodexTools\python\Scripts\python.exe' -m unittest discover -s windows/tests -p 'test_xuanjia_assets.py' -v
node --test windows/tests/theme-loader.test.mjs
```

Expected: 全部 PASS，四个图片文件均可由主题加载器读取。

- [ ] **Step 7: 提交最终主题图片**

```powershell
git add windows/scripts/build_xuanjia_assets.py windows/tests/test_xuanjia_assets.py windows/themes/xuanjia-chijin
git commit -m "feat(windows): add layered xuanjia artwork"
```

### Task 3: 实现首页/任务页状态与无文字头像 chrome

**Files:**
- Modify: `windows/tests/visual-contract.test.mjs`
- Modify: `windows/assets/renderer-inject.js`

- [ ] **Step 1: 写路由与无文案失败测试**

```js
test("renderer marks home and task shells without visible copy", async () => {
  const renderer = await read("assets/renderer-inject.js");
  assert.match(renderer, /dream-home-shell/);
  assert.match(renderer, /dream-task-shell/);
  assert.match(renderer, /dream-avatar/);
  assert.doesNotMatch(renderer, /textContent\s*=/);
  assert.doesNotMatch(renderer, /innerHTML\s*=\s*`[^`]*[\p{L}\p{N}]{2,}[^`]*`/u);
});
```

- [ ] **Step 2: 运行测试确认任务页类缺失**

Run: `node --test windows/tests/visual-contract.test.mjs`

Expected: FAIL，缺少 `dream-task-shell` 和 `dream-avatar`。

- [ ] **Step 3: 实现路由状态和清理**

在 `ensure()` 中使用首页探针，并把非首页的正常主内容标记为任务页：

```js
const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
const home = document.querySelector('[role="main"]:has([data-testid="home-icon"])');
const contentMain = shellMain?.querySelector('[role="main"]') || document.querySelector('[role="main"]');
const task = !home && Boolean(shellMain && contentMain);

home?.classList.add("dream-home");
shellMain?.classList.toggle("dream-home-shell", Boolean(home));
shellMain?.classList.toggle("dream-task-shell", task);
```

chrome 只包含无文字头像容器：

```js
chrome.innerHTML = '<div class="dream-avatar"></div>';
chrome.classList.toggle("dream-home-shell", Boolean(home));
chrome.classList.toggle("dream-task-shell", task);
```

`cleanup()` 移除 `dream-home`、`dream-home-shell`、`dream-task-shell` 和四个图片变量，并撤销四个 object URL。版本提升到 `3.0.0`。

- [ ] **Step 4: 运行无文案契约测试**

Run: `node --test windows/tests/visual-contract.test.mjs windows/tests/injector-theme-contract.test.mjs`

Expected: 全部 PASS。

- [ ] **Step 5: 提交 renderer 状态改造**

```powershell
git add windows/assets/renderer-inject.js windows/tests/visual-contract.test.mjs windows/tests/injector-theme-contract.test.mjs
git commit -m "feat(windows): mark home and task theme states"
```

### Task 4: 按概念图重建组件材质与布局

**Files:**
- Modify: `windows/tests/visual-contract.test.mjs`
- Modify: `windows/assets/dream-skin.css`

几何尺寸以仓库 `screenshot-macos-home.png` / `screenshot-macos-task.png` 为唯一权威；Cockpit 概念图只作为人物构图、玄铁/暗红/旧金材质和整体氛围参考。不得照搬概念图中过高的横幅、卡片或 composer。

- [ ] **Step 1: 写 macOS 同构几何失败测试**

```js
test("skin follows the approved home and task geometry", async () => {
  const css = await read("assets/dream-skin.css");
  assert.match(css, /height:\s*252px/);
  assert.match(css, /border-radius:\s*24px/);
  assert.match(css, /min-height:\s*126px/);
  assert.match(css, /border-radius:\s*21px/);
  assert.match(css, /composer-surface-chrome[\s\S]*border-radius:\s*23px/);
  assert.match(css, /main\.main-surface\.dream-task-shell/);
  assert.match(css, /var\(--dream-character\)/);
  assert.match(css, /\.dream-avatar/);
  assert.doesNotMatch(css, /dream-metal-frame|dream-snow/);
  assert.doesNotMatch(css, /content:\s*["'][^"']+["']/);
});
```

- [ ] **Step 2: 运行测试确认现有硬边设计失败**

Run: `node --test windows/tests/visual-contract.test.mjs`

Expected: FAIL，现有横幅/卡片/输入框仍为 `8px`，且存在 `dream-metal-frame`、`dream-snow`。

- [ ] **Step 3: 重写核心 CSS**

用以下确定几何替换当前视觉块，保留真实 DOM 选择器：

```css
.dream-home > div:first-child > div:first-child > div:first-child {
  position: relative !important;
  isolation: isolate;
  width: calc(100% - 44px) !important;
  height: 252px !important;
  min-height: 252px !important;
  overflow: visible !important;
  border: 1px solid color-mix(in srgb, var(--theme-gold) 62%, transparent) !important;
  border-radius: 24px !important;
  background: var(--dream-hero) center / cover no-repeat !important;
  box-shadow: 0 16px 38px rgba(0, 0, 0, .38), inset 0 0 0 3px rgba(255, 224, 166, .035) !important;
}

.dream-home > div:first-child > div:first-child > div:first-child::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: 23px;
  background: linear-gradient(90deg, rgba(6, 8, 11, .98) 0%, rgba(10, 12, 15, .92) 43%, rgba(29, 15, 17, .46) 68%, transparent 100%);
  pointer-events: none;
}

.dream-home > div:first-child > div:first-child > div:first-child::after {
  content: "";
  position: absolute;
  inset: -18px -8px -20px 42%;
  z-index: 0;
  background: var(--dream-character) right bottom / auto 108% no-repeat;
  pointer-events: none;
}

.dream-home .group\/home-suggestions button {
  min-height: 126px !important;
  border-radius: 21px !important;
  border: 1px solid color-mix(in srgb, var(--theme-line) 58%, transparent) !important;
  background: linear-gradient(145deg, rgba(25, 25, 27, .96), rgba(13, 16, 19, .98)) !important;
  box-shadow: 0 9px 22px rgba(0, 0, 0, .28), inset 0 0 0 2px rgba(183, 139, 76, .035) !important;
}

html.codex-dream-skin .composer-surface-chrome {
  border-radius: 23px !important;
  border: 1px solid color-mix(in srgb, var(--theme-line) 65%, transparent) !important;
  background: linear-gradient(145deg, rgba(21, 22, 24, .94), rgba(11, 14, 17, .91)) !important;
  box-shadow: 0 11px 28px rgba(0, 0, 0, .34), inset 0 0 0 3px rgba(183, 139, 76, .03) !important;
  backdrop-filter: blur(18px) saturate(112%) !important;
}

html.codex-dream-skin main.main-surface.dream-task-shell {
  background:
    linear-gradient(90deg, rgba(6, 9, 12, .97) 0%, rgba(9, 12, 15, .91) 55%, rgba(13, 13, 15, .68) 100%),
    var(--dream-character) right -7vw bottom -6vh / auto 88% no-repeat,
    var(--dream-hero) center / cover no-repeat !important;
}

html.codex-dream-skin main.main-surface.dream-task-shell article {
  border: 0;
  background: rgba(10, 13, 16, .18);
  box-shadow: none;
  backdrop-filter: blur(5px) saturate(104%);
}

.dream-avatar {
  position: absolute;
  left: 18px;
  top: 4px;
  width: 38px;
  height: 38px;
  display: none;
  border: 1px solid color-mix(in srgb, var(--theme-gold) 72%, transparent);
  border-radius: 50%;
  background: rgba(43, 14, 18, .86) var(--dream-avatar) center 16% / 142% auto no-repeat;
  box-shadow: 0 0 0 5px rgba(159, 37, 43, .08), 0 5px 16px rgba(0, 0, 0, .34);
}

#codex-dream-skin-chrome.dream-home-shell .dream-avatar { display: block; }

@media (max-width: 1120px) {
  .dream-home > div:first-child > div:first-child > div:first-child {
    height: 238px !important;
    min-height: 238px !important;
  }
  .dream-home > div:first-child > div:first-child > div:first-child::after {
    inset: -8px -24px -8px 44%;
    background-size: auto 106%;
  }
  .dream-home > div:first-child > div:first-child > div:first-child > div:first-child > div:first-child {
    width: 58% !important;
  }
}

@media (max-width: 900px) {
  .dream-home > div:first-child > div:first-child > div:first-child {
    height: 224px !important;
    min-height: 224px !important;
  }
  .dream-home > div:first-child > div:first-child > div:first-child::after {
    inset: 0 -42px -6px 48%;
    background-size: auto 102%;
  }
  .dream-home [data-feature="game-source"] { font-size: 23px !important; }
}
```

侧栏、顶栏、图标环、项目选择、按钮和滚动条使用同一玄铁/暗红/旧金变量；删除金属大框、雪点和所有硬编码装饰文案。composer 只改材质、边框和圆角，不覆盖原生高度。媒体查询按上面的确定数值调整人物和横幅，先保头冠、脸和双肩。

- [ ] **Step 4: 运行视觉契约测试**

Run: `node --test windows/tests/visual-contract.test.mjs`

Expected: 全部 PASS。

- [ ] **Step 5: 提交 CSS 重构**

```powershell
git add windows/assets/dream-skin.css windows/tests/visual-contract.test.mjs
git commit -m "feat(windows): implement cinematic xuanjia surfaces"
```

### Task 5: 扩展真实应用验证与 QA 清单

**Files:**
- Modify: `windows/tests/injector-theme-contract.test.mjs`
- Modify: `windows/scripts/injector.mjs`
- Modify: `windows/scripts/verify-dream-skin.ps1`
- Modify: `windows/references/qa-inventory.md`

- [ ] **Step 1: 写任务页和视口失败测试**

```js
test("verifier supports task state and explicit screenshot viewport", async () => {
  const injector = await read("scripts/injector.mjs");
  const verify = await read("scripts/verify-dream-skin.ps1");
  assert.match(injector, /--viewport/);
  assert.match(injector, /taskPresent/);
  assert.match(injector, /Emulation\.setDeviceMetricsOverride/);
  assert.match(verify, /\[string\]\$Viewport/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test windows/tests/injector-theme-contract.test.mjs`

Expected: FAIL，当前 verifier 没有任务页和视口参数。

- [ ] **Step 3: 实现 `--viewport` 与任务页状态**

`parseArgs()` 接受 `--viewport 1280x720` 并限制宽 `800..3840`、高 `600..2160`。截图前执行：

```js
if (viewport) {
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}
```

`verifySession()` 返回：

```js
taskPresent: Boolean(document.querySelector('main.main-surface.dream-task-shell')),
avatarPresent: Boolean(document.querySelector('#codex-dream-skin-chrome .dream-avatar')),
```

首页要求 hero、composer、sidebar 和响应式建议卡；任务页要求 `taskPresent`、composer、sidebar，且不要求 hero。`verify-dream-skin.ps1` 新增 `-Viewport` 并透传。

- [ ] **Step 4: 重写 QA 清单**

`qa-inventory.md` 明确列出：首页人物裁切、四卡/响应式卡片、项目选择、输入框；任务页正文/命令/附件/环境面板；头像不替换原生账户头像；无主题文案；装饰层 `pointer-events: none`；回退清理四个图片变量。

- [ ] **Step 5: 运行契约与脚本语法测试**

```powershell
node --test windows/tests/injector-theme-contract.test.mjs
$errors = $null; [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'windows/scripts/verify-dream-skin.ps1'), [ref]$null, [ref]$errors) | Out-Null; if ($errors.Count) { $errors; exit 1 }
```

Expected: 测试 PASS，PowerShell 解析错误数为 0。

- [ ] **Step 6: 提交验证改造**

```powershell
git add windows/scripts/injector.mjs windows/scripts/verify-dream-skin.ps1 windows/tests/injector-theme-contract.test.mjs windows/references/qa-inventory.md
git commit -m "test(windows): verify xuanjia home and task views"
```

### Task 6: 隔离 Codex 真实验收

**Files:**
- Modify only if QA finds a defect: `windows/assets/dream-skin.css`
- Modify only if QA finds a defect: `windows/assets/renderer-inject.js`
- Modify only if QA finds a defect: `windows/themes/xuanjia-chijin/theme.json`
- Create: `D:\Downloads\Codex-Dream-Skin-Xuanjia-V2-Home-1280x720-2026-07-16.png`
- Create: `D:\Downloads\Codex-Dream-Skin-Xuanjia-V2-Home-1600x900-2026-07-16.png`
- Create: `D:\Downloads\Codex-Dream-Skin-Xuanjia-V2-Home-1920x1080-2026-07-16.png`
- Create: `D:\Downloads\Codex-Dream-Skin-Xuanjia-V2-Task-1600x900-2026-07-16.png`

- [ ] **Step 1: 运行完整静态验证**

```powershell
node --test windows/tests/*.test.mjs
& 'D:\CodexTools\python\Scripts\python.exe' -m unittest discover -s windows/tests -p 'test_xuanjia_assets.py' -v
node --check windows/assets/renderer-inject.js
node --check windows/scripts/injector.mjs
git diff --check
```

Expected: Node 和 Python 全部 PASS；两个语法检查退出码 0；`git diff --check` 无输出。

- [ ] **Step 2: 启动隔离 QA 实例**

使用 `D:\Cache\CodexDreamSkin\xuanjia-v2-qa-profile` 和端口 `9347`，不关闭或重启当前 Codex：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File windows/scripts/start-dream-skin.ps1 -Port 9347 -ProfilePath 'D:\Cache\CodexDreamSkin\xuanjia-v2-qa-profile' -ThemeId xuanjia-chijin
```

Expected: 新的隔离 Codex 窗口启动，验证器返回成功；现有 Codex 进程不受影响。

- [ ] **Step 3: 捕获三个首页视口**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File windows/scripts/verify-dream-skin.ps1 -Port 9347 -Viewport 1280x720 -ScreenshotPath 'D:\Downloads\Codex-Dream-Skin-Xuanjia-V2-Home-1280x720-2026-07-16.png'
powershell -NoProfile -ExecutionPolicy Bypass -File windows/scripts/verify-dream-skin.ps1 -Port 9347 -Viewport 1600x900 -ScreenshotPath 'D:\Downloads\Codex-Dream-Skin-Xuanjia-V2-Home-1600x900-2026-07-16.png'
powershell -NoProfile -ExecutionPolicy Bypass -File windows/scripts/verify-dream-skin.ps1 -Port 9347 -Viewport 1920x1080 -ScreenshotPath 'D:\Downloads\Codex-Dream-Skin-Xuanjia-V2-Home-1920x1080-2026-07-16.png'
```

逐张检查：人物脸、头冠、双肩可见；原生标题不压人物；建议卡和输入框不重叠；侧栏无纯黑断层；没有额外主题文字。

- [ ] **Step 4: 捕获任务页并检查真实交互**

在隔离窗口中打开一个普通任务，再运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File windows/scripts/verify-dream-skin.ps1 -Port 9347 -Viewport 1600x900 -ScreenshotPath 'D:\Downloads\Codex-Dream-Skin-Xuanjia-V2-Task-1600x900-2026-07-16.png'
```

检查正文、命令块、附件、右侧环境面板和 composer；人物必须在右侧背景且低于正文对比。点击建议卡、项目选择、输入框、下拉菜单和侧栏任务，确认装饰层不拦截。

- [ ] **Step 5: 执行回退/重注入验证**

```powershell
node windows/scripts/injector.mjs --remove --port 9347
node windows/scripts/injector.mjs --once --port 9347 --theme-dir windows/themes/xuanjia-chijin
node windows/scripts/injector.mjs --verify --port 9347
```

Expected: remove 后主题类、chrome 和四个图片变量消失；once 后恢复；verify 退出码 0。

- [ ] **Step 6: 只关闭隔离 QA 进程并验证工作区**

```powershell
$qaProfile = 'D:\Cache\CodexDreamSkin\xuanjia-v2-qa-profile'
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$qaProfile*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
git status --short
```

保留 QA 截图；不删除用户当前 Codex 配置，不终止不含 QA profile 参数的进程。

- [ ] **Step 7: 提交 QA 修正**

若 QA 产生修正，只提交相关主题文件和测试：

```powershell
git add windows/assets/dream-skin.css windows/assets/renderer-inject.js windows/themes/xuanjia-chijin windows/tests windows/references/qa-inventory.md
git commit -m "fix(windows): polish xuanjia responsive composition"
```

如果 QA 不需要修正，不创建空提交。

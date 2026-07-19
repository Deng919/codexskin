import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const windowsRoot = path.resolve(here, "..");

async function read(relativePath) {
  return fs.readFile(path.join(windowsRoot, relativePath), "utf8");
}

test("renderer injects no visible theme copy", async () => {
  const renderer = await read("assets/renderer-inject.js");

  assert.doesNotMatch(renderer, /薛凯琪|Fiona Sit|专属定制皮肤|限定版/);
  assert.doesNotMatch(renderer, /dream-brand|dream-signature|dream-ribbon|dream-polaroid/);
  assert.doesNotMatch(renderer, /innerHTML\s*=\s*`[^`]*<(?:b|small|span)[^>]*>[^<]+/s);
});

test("renderer marks home and task shells without custom avatar chrome", async () => {
  const renderer = await read("assets/renderer-inject.js");

  assert.match(renderer, /dream-home-shell/);
  assert.match(renderer, /dream-task-shell/);
  assert.doesNotMatch(renderer, /innerHTML\s*=.*dream-avatar/);
  assert.doesNotMatch(renderer, /dream-metal-frame|dream-snow/);
  assert.doesNotMatch(renderer, /textContent\s*=\s*THEME/);
});

test("renderer maps visual theme data to CSS variables", async () => {
  const renderer = await read("assets/renderer-inject.js");

  assert.match(renderer, /__DREAM_HERO_JSON__/);
  assert.match(renderer, /__DREAM_TEXTURE_JSON__/);
  assert.match(renderer, /__DREAM_CHARACTER_JSON__/);
  assert.doesNotMatch(renderer, /__DREAM_AVATAR_JSON__/);
  assert.match(renderer, /__DREAM_THEME_JSON__/);
  assert.match(renderer, /--theme-hero-size/);
  assert.match(renderer, /--theme-hero-position/);
  assert.doesNotMatch(renderer, /--theme-overlay-strength/);
  assert.match(renderer, /--theme-texture-opacity/);
  for (const variable of [
    "character-size", "character-position",
    "character-size-narrow", "character-position-narrow",
  ]) {
    assert.match(renderer, new RegExp(`--theme-${variable}`));
  }
  for (const variable of [
    "link", "code", "quote", "success", "warning", "danger", "diff-added", "diff-removed",
  ]) {
    assert.match(renderer, new RegExp(`--theme-${variable}`));
  }
  assert.match(renderer, /--dream-character/);
  assert.doesNotMatch(renderer, /--dream-avatar/);
});

test("task content consumes the theme-specific semantic palette", async () => {
  const css = await read("assets/dream-skin.css");

  assert.match(css, /article a[\s\S]{0,300}var\(--theme-link\)/);
  assert.match(css, /code:not\(pre code\)[\s\S]{0,300}var\(--theme-code\)/);
  assert.match(css, /dream-task-shell \.inline-markdown[\s\S]{0,300}var\(--theme-code\)/);
  assert.match(css, /blockquote[\s\S]{0,300}var\(--theme-quote\)/);
  for (const variable of ["success", "warning", "danger", "diff-added", "diff-removed"]) {
    assert.match(css, new RegExp(`var\\(--theme-${variable}\\)`));
  }
});

test("installer forwards per-theme diff colors to native Codex semantics", async () => {
  const install = await read("scripts/install-dream-skin.ps1");

  assert.match(install, /ThemeConfig\.colors\.diffAdded/);
  assert.match(install, /ThemeConfig\.colors\.diffRemoved/);
  assert.doesNotMatch(install, /diffAdded\s*=\s*`"#3D7A59/);
  assert.doesNotMatch(install, /diffRemoved\s*=\s*`"#A83A43/);
});

test("skin CSS is data-driven and contains no Fiona pink-purple palette", async () => {
  const css = await read("assets/dream-skin.css");

  assert.doesNotMatch(css, /--dream-pink|--dream-purple/i);
  assert.doesNotMatch(css, /#ff73bd|#b65cff|#a14fe0|#cf61f0|#ff96c9|#af55df/i);
  assert.match(css, /var\(--theme-accent\)/);
  assert.match(css, /var\(--theme-gold\)/);
  assert.match(css, /var\(--theme-hero-size\)/);
  assert.match(css, /var\(--theme-hero-position\)/);
  assert.doesNotMatch(css, /rgba\(65,\s*20,\s*24|rgba\(126,\s*30,\s*36|rgba\(62,\s*20,\s*24|#2d1518/i);
});

test("skin does not render a custom avatar overlay", async () => {
  const css = await read("assets/dream-skin.css");

  assert.doesNotMatch(css, /\.dream-avatar/);
});

test("home and task views share the same full-window scene", async () => {
  const css = await read("assets/dream-skin.css");

  assert.match(css, /main\.main-surface\.dream-home-shell/);
  assert.match(css, /main\.main-surface\.dream-task-shell/);
  assert.match(css, /main\.main-surface\.dream-home-shell[\s\S]{0,240}var\(--dream-character\)[\s\S]{0,120}var\(--dream-hero\)/);
  assert.match(css, /var\(--theme-character-position\)\s*\/\s*var\(--theme-character-size\)/);
  assert.match(css, /var\(--theme-character-position-narrow\)\s*\/\s*var\(--theme-character-size-narrow\)/);
  assert.doesNotMatch(css, /\.dream-home[^{}]*::after[^{}]*\{[^}]*var\(--dream-character\)/s);
  assert.match(css, /min-height:\s*126px/);
  assert.match(css, /border-radius:\s*21px/);
  assert.match(css, /composer-surface-chrome[\s\S]{0,500}border-radius:\s*23px/);
  assert.match(css, /main\.main-surface\.dream-task-shell/);
  assert.match(css, /dream-task-shell \[data-app-action-timeline-scroll\]/);
  assert.doesNotMatch(css, /dream-task-shell \[role="main"\]/);
  assert.match(css, /var\(--dream-character\)/);
  assert.doesNotMatch(css, /dream-metal-frame|dream-snow/);
  assert.doesNotMatch(css, /content:\s*["'][^"']+["']/);
});

test("home suggestion icons and labels share one centered axis", async () => {
  const css = await read("assets/dream-skin.css");
  const renderer = await read("assets/renderer-inject.js");

  assert.match(renderer, /const VERSION = "3\.4\.4";/);

  assert.match(
    css,
    /group\\\/home-suggestions button > span:first-child\s*\{[^}]*display:\s*grid\s*!important;[^}]*place-items:\s*center\s*!important;[^}]*place-content:\s*center\s*!important;[^}]*width:\s*100%\s*!important;/s,
  );
  assert.match(
    css,
    /group\\\/home-suggestions button > span:first-child > span:first-child\s*\{[^}]*justify-self:\s*center;[^}]*margin:\s*0;/s,
  );
  assert.match(
    css,
    /group\\\/home-suggestions button > span:last-child\s*\{[^}]*width:\s*100%\s*!important;[^}]*align-items:\s*center\s*!important;[^}]*text-align:\s*center\s*!important;/s,
  );
});

test("xuanjia scene centers the battlefield behind the character layer", async () => {
  const config = JSON.parse(await read("themes/xuanjia-chijin/theme.json"));

  assert.equal(config.layout.heroPosition, "50% 50%");
});

test("installer selects a dark neutral base theme instead of the old pink chrome", async () => {
  const install = await read("scripts/install-dream-skin.ps1");

  assert.match(install, /appearanceTheme\s*=\s*'appearanceTheme = "dark"'/);
  assert.match(install, /appearanceDarkChromeTheme/);
  assert.doesNotMatch(install, /#B65CFF|#FFF4FA|#4A235F/i);
});

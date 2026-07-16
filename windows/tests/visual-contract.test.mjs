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

test("renderer marks home and task shells with avatar-only chrome", async () => {
  const renderer = await read("assets/renderer-inject.js");

  assert.match(renderer, /dream-home-shell/);
  assert.match(renderer, /dream-task-shell/);
  assert.match(renderer, /dream-avatar/);
  assert.doesNotMatch(renderer, /dream-metal-frame|dream-snow/);
  assert.doesNotMatch(renderer, /textContent\s*=\s*THEME/);
});

test("renderer maps visual theme data to CSS variables", async () => {
  const renderer = await read("assets/renderer-inject.js");

  assert.match(renderer, /__DREAM_HERO_JSON__/);
  assert.match(renderer, /__DREAM_TEXTURE_JSON__/);
  assert.match(renderer, /__DREAM_CHARACTER_JSON__/);
  assert.match(renderer, /__DREAM_AVATAR_JSON__/);
  assert.match(renderer, /__DREAM_THEME_JSON__/);
  assert.match(renderer, /--theme-hero-size/);
  assert.match(renderer, /--theme-hero-position/);
  assert.match(renderer, /--theme-overlay-strength/);
  assert.match(renderer, /--theme-texture-opacity/);
  assert.match(renderer, /--dream-character/);
  assert.match(renderer, /--dream-avatar/);
});

test("skin CSS is data-driven and contains no Fiona pink-purple palette", async () => {
  const css = await read("assets/dream-skin.css");

  assert.doesNotMatch(css, /--dream-pink|--dream-purple/i);
  assert.doesNotMatch(css, /#ff73bd|#b65cff|#a14fe0|#cf61f0|#ff96c9|#af55df/i);
  assert.match(css, /var\(--theme-accent\)/);
  assert.match(css, /var\(--theme-gold\)/);
  assert.match(css, /var\(--theme-hero-size\)/);
  assert.match(css, /var\(--theme-hero-position\)/);
});

test("decorative chrome cannot intercept native Codex controls", async () => {
  const css = await read("assets/dream-skin.css");

  assert.match(css, /#codex-dream-skin-chrome\s*\{[^}]*pointer-events:\s*none/s);
});

test("xuanjia hero crop keeps the crown and face inside the banner", async () => {
  const config = JSON.parse(await read("themes/xuanjia-chijin/theme.json"));

  assert.equal(config.layout.heroPosition, "58% 0%");
});

test("installer selects a dark neutral base theme instead of the old pink chrome", async () => {
  const install = await read("scripts/install-dream-skin.ps1");

  assert.match(install, /appearanceTheme\s*=\s*'appearanceTheme = "dark"'/);
  assert.match(install, /appearanceDarkChromeTheme/);
  assert.doesNotMatch(install, /#B65CFF|#FFF4FA|#4A235F/i);
});

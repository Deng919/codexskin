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

test("injector requires and loads a theme directory", async () => {
  const injector = await read("scripts/injector.mjs");

  assert.match(injector, /--theme-dir/);
  assert.match(injector, /buildThemePayload/);
  assert.doesNotMatch(injector, /dream-reference\.png/);
  assert.match(injector, /__DREAM_HERO_JSON__/);
  assert.match(injector, /__DREAM_TEXTURE_JSON__/);
  assert.match(injector, /__DREAM_CHARACTER_JSON__/);
  assert.match(injector, /__DREAM_AVATAR_JSON__/);
  assert.match(injector, /__DREAM_THEME_JSON__/);
});

test("start script resolves the active theme and forwards it to every injector call", async () => {
  const start = await read("scripts/start-dream-skin.ps1");

  assert.match(start, /\[string\]\$ThemeId/);
  assert.match(start, /active-theme\.txt/);
  assert.match(start, /windows[\\/]themes|Join-Path \$SkillRoot 'themes'/);
  assert.match(start, /--theme-dir/);
  assert.match(start, /themeId\s*=\s*\$ThemeId/);
});

test("start script launches the Store package through app activation", async () => {
  const start = await read("scripts/start-dream-skin.ps1");

  assert.match(start, /IApplicationActivationManager/);
  assert.match(start, /ActivateApplication/);
  assert.match(start, /PackageFamilyName/);
  assert.doesNotMatch(start, /Start-Process\s+-FilePath\s+\$exe/);
});

test("installer shortcuts preserve the selected active theme behavior", async () => {
  const install = await read("scripts/install-dream-skin.ps1");

  assert.match(install, /\[string\]\$ThemeId/);
  assert.match(install, /-ThemeId/);
});

test("injector fallback removal clears the new theme assets", async () => {
  const injector = await read("scripts/injector.mjs");

  assert.match(injector, /removeProperty\('--dream-hero'\)/);
  assert.match(injector, /removeProperty\('--dream-texture'\)/);
  assert.match(injector, /removeProperty\('--dream-character'\)/);
  assert.match(injector, /removeProperty\('--dream-avatar'\)/);
  assert.match(injector, /themeId:\s*window\.__CODEX_DREAM_SKIN_STATE__/);
});

test("renderer recognizes current Codex task timelines without a main role", async () => {
  const renderer = await read("assets/renderer-inject.js");

  assert.match(renderer, /data-app-action-timeline-scroll/);
  assert.match(renderer, /dream-task-shell/);
});

test("verifier supports task state and an explicit screenshot viewport", async () => {
  const injector = await read("scripts/injector.mjs");
  const verify = await read("scripts/verify-dream-skin.ps1");

  assert.match(injector, /--viewport/);
  assert.match(injector, /taskPresent/);
  assert.match(injector, /Emulation\.setDeviceMetricsOverride/);
  assert.match(verify, /\[string\]\$Viewport/);
  assert.match(verify, /--viewport/);
});

test("one-shot verification ignores the auxiliary avatar overlay", async () => {
  const injector = await read("scripts/injector.mjs");

  assert.match(injector, /isAuxiliaryTarget/);
  assert.match(injector, /avatar-overlay/);
  assert.match(injector, /filter\(\(target\) => !isAuxiliaryTarget\(target\)\)/);
});

test("watch mode cleans the avatar overlay and injects only primary targets", async () => {
  const injector = await read("scripts/injector.mjs");

  assert.match(injector, /const auxiliaryTargets = targets\.filter\(isAuxiliaryTarget\)/);
  assert.match(injector, /removeFromSession\(auxiliarySession\)/);
  assert.match(injector, /const primaryTargets = targets\.filter\(\(target\) => !isAuxiliaryTarget\(target\)\)/);
  assert.match(injector, /for \(const target of primaryTargets\)/);
});

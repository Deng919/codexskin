import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildThemePayload, loadTheme } from "../scripts/theme-loader.mjs";

const MAX_ART_BYTES = 16 * 1024 * 1024;
const here = path.dirname(fileURLToPath(import.meta.url));
const windowsRoot = path.resolve(here, "..");

function baseTheme(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "xuanjia-chijin",
    name: "玄甲赤金",
    hero: "hero.png",
    texture: "texture.png",
    character: "assets/xuanjia-character-cutout.png",
    colors: {
      background: "#100D0E",
      panel: "#171214",
      panelAlt: "#211719",
      accent: "#9F252B",
      gold: "#B89352",
      text: "#F2ECE4",
      muted: "#A79B95",
      line: "#6D4A32",
    },
    layout: {
      heroSize: "cover",
      heroPosition: "58% 36%",
      textureOpacity: 0.12,
    },
    ...overrides,
  };
}

async function makeTheme(overrides = {}, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-theme-test-"));
  const theme = baseTheme(overrides);
  await fs.writeFile(path.join(root, "theme.json"), `${JSON.stringify(theme, null, 2)}\n`);
  await fs.mkdir(path.join(root, "assets"), { recursive: true });
  if (!options.skipHero) await fs.writeFile(path.join(root, "hero.png"), Buffer.from("hero"));
  if (!options.skipTexture) await fs.writeFile(path.join(root, "texture.png"), Buffer.from("texture"));
  if (!options.skipCharacter) {
    await fs.writeFile(path.join(root, "assets", "xuanjia-character-cutout.png"), Buffer.from("character"));
  }
  return root;
}

test("loads a valid visual-only theme", async (t) => {
  const root = await makeTheme();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const loaded = await loadTheme(root);

  assert.equal(loaded.theme.id, "xuanjia-chijin");
  assert.equal(loaded.theme.layout.heroPosition, "58% 36%");
  assert.equal(loaded.hero.mime, "image/png");
  assert.equal(loaded.texture.mime, "image/png");
  assert.equal(loaded.character.mime, "image/png");
  assert.equal("tagline" in loaded.theme, false);
});

test("builds data URLs for all local theme images", async (t) => {
  const root = await makeTheme();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const payload = await buildThemePayload(root);

  assert.match(payload.heroDataUrl, /^data:image\/png;base64,/);
  assert.match(payload.textureDataUrl, /^data:image\/png;base64,/);
  assert.match(payload.characterDataUrl, /^data:image\/png;base64,/);
  assert.equal(payload.theme.name, "玄甲赤金");
});

test("loads a flattened scene without an optional character asset", async (t) => {
  const root = await makeTheme({ character: null }, { skipCharacter: true });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const loaded = await loadTheme(root);
  const payload = await buildThemePayload(root);

  assert.equal(loaded.theme.character, null);
  assert.equal(loaded.character, null);
  assert.equal(payload.characterDataUrl, null);
  assert.equal("avatar" in loaded.theme, false);
});

test("rejects image traversal outside the theme directory", async (t) => {
  const root = await makeTheme({ hero: "../secret.png" });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await assert.rejects(loadTheme(root), /hero must stay inside its theme directory/);
});

test("rejects character traversal outside the theme directory", async (t) => {
  const root = await makeTheme({ character: "../character.png" });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await assert.rejects(loadTheme(root), /character must stay inside its theme directory/);
});

test("rejects unsupported schemas", async (t) => {
  const root = await makeTheme({ schemaVersion: 2 });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await assert.rejects(loadTheme(root), /unsupported theme schema/);
});

test("rejects invalid colors", async (t) => {
  const theme = baseTheme();
  const root = await makeTheme({ colors: { ...theme.colors, accent: "red" } });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await assert.rejects(loadTheme(root), /colors\.accent must be a six-digit hex color/);
});

test("rejects missing image files", async (t) => {
  const root = await makeTheme({}, { skipTexture: true });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await assert.rejects(loadTheme(root), /texture image could not be read/);
});

test("rejects oversized image files", async (t) => {
  const root = await makeTheme();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const handle = await fs.open(path.join(root, "hero.png"), "w");
  await handle.truncate(MAX_ART_BYTES + 1);
  await handle.close();

  await assert.rejects(loadTheme(root), /hero image must be no larger than/);
});

test("loads the blue night theme as a separate theme pack", async () => {
  const loaded = await loadTheme(path.join(windowsRoot, "themes", "blue-night-red-eyes"));

  assert.equal(loaded.theme.id, "blue-night-red-eyes");
  assert.equal(loaded.theme.colors.background, "#020817");
  assert.equal(loaded.theme.colors.accent, "#176CA4");
  assert.equal(loaded.theme.layout.heroPosition, "50% 50%");
  assert.equal(loaded.theme.character, null);
  assert.ok(loaded.hero.bytes.length > 1_000_000);
  assert.ok(loaded.hero.bytes.length < MAX_ART_BYTES);
});

import fs from "node:fs/promises";
import path from "node:path";

const MAX_ART_BYTES = 16 * 1024 * 1024;
const COLOR_KEYS = [
  "background", "panel", "panelAlt", "accent", "accentAlt",
  "gold", "text", "muted", "line",
];
const MIME_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireText(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be text`);
  return value.trim().slice(0, maxLength);
}

function requireColor(value, label) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`${label} must be a six-digit hex color`);
  }
  return value.toUpperCase();
}

function requireUnitInterval(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a number from 0 to 1`);
  }
  return value;
}

function requireHeroSize(value) {
  const normalized = requireText(value, "layout.heroSize", 32);
  if (normalized === "cover" || normalized === "contain") return normalized;
  if (/^(?:auto|\d{1,3}(?:\.\d+)?%)(?:\s+(?:auto|\d{1,3}(?:\.\d+)?%))?$/.test(normalized)) {
    return normalized;
  }
  throw new Error("layout.heroSize is not supported");
}

function positionToken(token) {
  if (["left", "center", "right", "top", "bottom"].includes(token)) return true;
  const match = /^(\d{1,3}(?:\.\d+)?)%$/.exec(token);
  return Boolean(match) && Number(match[1]) <= 100;
}

function requireHeroPosition(value) {
  const normalized = requireText(value, "layout.heroPosition", 32);
  const tokens = normalized.split(/\s+/);
  if (tokens.length !== 2 || !tokens.every(positionToken)) {
    throw new Error("layout.heroPosition must contain two valid position values");
  }
  return normalized;
}

function validateImageName(value, label) {
  const name = requireText(value, label, 120);
  if (path.basename(name) !== name) throw new Error(`${label} must stay inside its theme directory`);
  const extension = path.extname(name).toLowerCase();
  const mime = MIME_TYPES.get(extension);
  if (!mime) throw new Error(`${label} must be a PNG, JPEG, or WebP file`);
  return { name, mime };
}

async function readImage(root, descriptor, label) {
  const imagePath = path.join(root, descriptor.name);
  let stat;
  let bytes;
  try {
    stat = await fs.stat(imagePath);
    if (!stat.isFile()) throw new Error("not a file");
    if (stat.size < 1) throw new Error("empty file");
    if (stat.size > MAX_ART_BYTES) {
      throw new Error(`${label} image must be no larger than ${MAX_ART_BYTES} bytes`);
    }
    bytes = await fs.readFile(imagePath);
  } catch (error) {
    if (error.message.includes("must be no larger")) throw error;
    throw new Error(`${label} image could not be read: ${error.message}`);
  }
  return { path: imagePath, mime: descriptor.mime, bytes };
}

export async function loadTheme(themeDir) {
  const root = path.resolve(themeDir);
  const configPath = path.join(root, "theme.json");
  const raw = requireObject(JSON.parse(await fs.readFile(configPath, "utf8")), "theme");
  if (raw.schemaVersion !== 1) throw new Error("unsupported theme schema");

  const id = requireText(raw.id, "id", 80);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(id)) {
    throw new Error("id must contain lowercase letters, numbers, or hyphens");
  }
  const colorsInput = requireObject(raw.colors, "colors");
  const layoutInput = requireObject(raw.layout, "layout");
  const colors = Object.fromEntries(COLOR_KEYS.map((key) => [
    key,
    requireColor(colorsInput[key], `colors.${key}`),
  ]));
  const theme = {
    schemaVersion: 1,
    id,
    name: requireText(raw.name, "name", 80),
    hero: requireText(raw.hero, "hero", 120),
    texture: requireText(raw.texture, "texture", 120),
    colors,
    layout: {
      heroSize: requireHeroSize(layoutInput.heroSize),
      heroPosition: requireHeroPosition(layoutInput.heroPosition),
      heroOverlayStrength: requireUnitInterval(layoutInput.heroOverlayStrength, "layout.heroOverlayStrength"),
      textureOpacity: requireUnitInterval(layoutInput.textureOpacity, "layout.textureOpacity"),
    },
  };

  const heroDescriptor = validateImageName(theme.hero, "hero");
  const textureDescriptor = validateImageName(theme.texture, "texture");
  const [hero, texture] = await Promise.all([
    readImage(root, heroDescriptor, "hero"),
    readImage(root, textureDescriptor, "texture"),
  ]);
  return { root, theme, hero, texture };
}

export async function buildThemePayload(themeDir) {
  const loaded = await loadTheme(themeDir);
  return {
    theme: loaded.theme,
    heroDataUrl: `data:${loaded.hero.mime};base64,${loaded.hero.bytes.toString("base64")}`,
    textureDataUrl: `data:${loaded.texture.mime};base64,${loaded.texture.bytes.toString("base64")}`,
  };
}

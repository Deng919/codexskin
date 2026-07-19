import fs from "node:fs/promises";
import path from "node:path";

const MAX_ART_BYTES = 16 * 1024 * 1024;
const CHARACTER_LAYOUT_DEFAULTS = Object.freeze({
  characterSize: "auto 94%",
  characterPosition: "right -5vw bottom -5vh",
  characterSizeNarrow: "auto 82%",
  characterPositionNarrow: "right -18vw bottom -4vh",
});
const BASE_COLOR_KEYS = [
  "background", "panel", "panelAlt", "accent",
  "gold", "text", "muted", "line",
];
const SEMANTIC_COLOR_FALLBACKS = {
  link: (colors) => colors.gold,
  code: (colors) => colors.gold,
  quote: (colors) => colors.muted,
  success: () => "#83AD87",
  warning: (colors) => colors.gold,
  danger: (colors) => colors.accent,
  diffAdded: () => "#6F9F76",
  diffRemoved: () => "#B95C64",
};
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

function percentageToken(token) {
  const match = /^(\d{1,3}(?:\.\d+)?)%$/.exec(token);
  return Boolean(match) && Number(match[1]) <= 200;
}

function requireCharacterSize(value, label) {
  const normalized = requireText(value, label, 32);
  const tokens = normalized.split(/\s+/);
  const valid = tokens.length === 2 && (
    (tokens[0] === "auto" && percentageToken(tokens[1])) ||
    (percentageToken(tokens[0]) && tokens[1] === "auto")
  );
  if (valid) return normalized;
  throw new Error(`${label} must contain auto and a percentage no larger than 200%`);
}

function characterOffsetToken(token) {
  const match = /^(-?\d{1,3}(?:\.\d+)?)(px|vw|vh|%)$/.exec(token);
  return Boolean(match) && Math.abs(Number(match[1])) <= 200;
}

function requireCharacterPosition(value, label) {
  const normalized = requireText(value, label, 48);
  const tokens = normalized.split(/\s+/);
  const valid = tokens.length === 4 &&
    ["left", "right"].includes(tokens[0]) &&
    characterOffsetToken(tokens[1]) &&
    ["top", "bottom"].includes(tokens[2]) &&
    characterOffsetToken(tokens[3]);
  if (valid) return normalized;
  throw new Error(`${label} must use horizontal edge/offset and vertical edge/offset`);
}

function validateImageName(value, label) {
  const name = requireText(value, label, 120);
  const normalized = name.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (
    path.isAbsolute(name) ||
    path.win32.isAbsolute(name) ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`${label} must stay inside its theme directory`);
  }
  const extension = path.extname(normalized).toLowerCase();
  const mime = MIME_TYPES.get(extension);
  if (!mime) throw new Error(`${label} must be a PNG, JPEG, or WebP file`);
  return { name: normalized, mime };
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
  const colors = Object.fromEntries(BASE_COLOR_KEYS.map((key) => [
    key,
    requireColor(colorsInput[key], `colors.${key}`),
  ]));
  for (const [key, fallback] of Object.entries(SEMANTIC_COLOR_FALLBACKS)) {
    colors[key] = colorsInput[key] == null
      ? fallback(colors)
      : requireColor(colorsInput[key], `colors.${key}`);
  }
  const theme = {
    schemaVersion: 1,
    id,
    name: requireText(raw.name, "name", 80),
    hero: requireText(raw.hero, "hero", 120),
    texture: requireText(raw.texture, "texture", 120),
    character: raw.character == null ? null : requireText(raw.character, "character", 120),
    colors,
    layout: {
      heroSize: requireHeroSize(layoutInput.heroSize),
      heroPosition: requireHeroPosition(layoutInput.heroPosition),
      textureOpacity: requireUnitInterval(layoutInput.textureOpacity, "layout.textureOpacity"),
      characterSize: requireCharacterSize(
        layoutInput.characterSize ?? CHARACTER_LAYOUT_DEFAULTS.characterSize,
        "layout.characterSize",
      ),
      characterPosition: requireCharacterPosition(
        layoutInput.characterPosition ?? CHARACTER_LAYOUT_DEFAULTS.characterPosition,
        "layout.characterPosition",
      ),
      characterSizeNarrow: requireCharacterSize(
        layoutInput.characterSizeNarrow ?? CHARACTER_LAYOUT_DEFAULTS.characterSizeNarrow,
        "layout.characterSizeNarrow",
      ),
      characterPositionNarrow: requireCharacterPosition(
        layoutInput.characterPositionNarrow ?? CHARACTER_LAYOUT_DEFAULTS.characterPositionNarrow,
        "layout.characterPositionNarrow",
      ),
    },
  };

  const heroDescriptor = validateImageName(theme.hero, "hero");
  const textureDescriptor = validateImageName(theme.texture, "texture");
  const characterDescriptor = theme.character ? validateImageName(theme.character, "character") : null;
  const [hero, texture, character] = await Promise.all([
    readImage(root, heroDescriptor, "hero"),
    readImage(root, textureDescriptor, "texture"),
    characterDescriptor ? readImage(root, characterDescriptor, "character") : Promise.resolve(null),
  ]);
  return { root, theme, hero, texture, character };
}

export async function buildThemePayload(themeDir) {
  const loaded = await loadTheme(themeDir);
  return {
    theme: loaded.theme,
    heroDataUrl: `data:${loaded.hero.mime};base64,${loaded.hero.bytes.toString("base64")}`,
    textureDataUrl: `data:${loaded.texture.mime};base64,${loaded.texture.bytes.toString("base64")}`,
    characterDataUrl: loaded.character
      ? `data:${loaded.character.mime};base64,${loaded.character.bytes.toString("base64")}`
      : null,
  };
}

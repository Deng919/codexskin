# Layered Windows Theme Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all five Windows theme packs to true background-plus-transparent-character layers, with per-theme desktop and narrow-window character placement.

**Architecture:** Extend schema-v1 layout data with four optional character placement fields and map them through the existing loader and renderer to CSS variables. Preserve original character pixels through local matting, use the current Cockpit account only to reconstruct character-free backgrounds, and validate each pack independently before publication.

**Tech Stack:** Node.js ESM and `node:test`, renderer JavaScript, CSS custom properties, Python from `D:\CodexTools\python\Scripts\python.exe`, Pillow/OpenCV/ONNX Runtime, temporary `rembg`, PowerShell, Cockpit wrapper, CDP-based Codex QA, Git.

---

## File Map

- Runtime: `windows/scripts/theme-loader.mjs`, `windows/assets/renderer-inject.js`, `windows/assets/dream-skin.css`.
- Tests: `windows/tests/theme-loader.test.mjs`, `windows/tests/visual-contract.test.mjs`, `windows/tests/test_theme_assets.py`.
- Packs: the five directories under `windows/themes/`.
- Docs: `README.md`, `README.en.md`, `windows/THEME_AUTHORING.md`, `windows/references/qa-inventory.md`.
- Temporary only: `D:\Cache\Codex-Dream-Skin\layered-theme-rebuild-2026-07-19\`; never commit this tree.

### Task 1: Lock the Character Layout Schema with Failing Tests

**Files:**
- Modify: `windows/tests/theme-loader.test.mjs`
- Test: `windows/tests/theme-loader.test.mjs`

- [ ] **Step 1: Extend the valid fixture**

Add to the fixture layout:

```js
characterSize: "auto 94%",
characterPosition: "right -5vw bottom -5vh",
characterSizeNarrow: "auto 82%",
characterPositionNarrow: "right -18vw bottom -4vh",
```

- [ ] **Step 2: Assert normalization and compatibility defaults**

Assert the four values above survive loading. Create a second fixture with those keys deleted and assert the same four values are supplied as defaults.

- [ ] **Step 3: Add rejected-value cases**

```js
for (const [field, value] of [
  ["characterSize", "url(https://example.invalid/a.png)"],
  ["characterSizeNarrow", "auto 999%"],
  ["characterPosition", "right; color: red"],
  ["characterPositionNarrow", "calc(100% - 2px) center"],
]) {
  const theme = baseTheme();
  const root = await makeTheme({ layout: { ...theme.layout, [field]: value } });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(
    loadTheme(root),
    new RegExp(`layout\\.${field}`),
  );
}
```

- [ ] **Step 4: Verify red state**

Run `node --test windows/tests/theme-loader.test.mjs`.

Expected: failure because the loader does not yet expose or validate the new fields.

### Task 2: Implement Safe Per-Theme Character Layout

**Files:**
- Modify: `windows/scripts/theme-loader.mjs`
- Modify: `windows/assets/renderer-inject.js`
- Modify: `windows/assets/dream-skin.css`
- Modify: `windows/tests/visual-contract.test.mjs`

- [ ] **Step 1: Add loader defaults and validators**

```js
const CHARACTER_LAYOUT_DEFAULTS = Object.freeze({
  characterSize: "auto 94%",
  characterPosition: "right -5vw bottom -5vh",
  characterSizeNarrow: "auto 82%",
  characterPositionNarrow: "right -18vw bottom -4vh",
});

function percentageToken(token) {
  const match = /^(\d{1,3}(?:\.\d+)?)%$/.exec(token);
  return Boolean(match) && Number(match[1]) <= 200;
}

function requireCharacterSize(value, label) {
  const normalized = requireText(value, label, 32);
  const tokens = normalized.split(/\s+/);
  const valid = tokens.length === 2 &&
    ((tokens[0] === "auto" && percentageToken(tokens[1])) ||
      (percentageToken(tokens[0]) && tokens[1] === "auto"));
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
    ["left", "right"].includes(tokens[0]) && characterOffsetToken(tokens[1]) &&
    ["top", "bottom"].includes(tokens[2]) && characterOffsetToken(tokens[3]);
  if (valid) return normalized;
  throw new Error(`${label} must use horizontal edge/offset and vertical edge/offset`);
}
```

Normalize all four keys into `theme.layout`, using the defaults when absent.

- [ ] **Step 2: Verify loader green state**

Run `node --test windows/tests/theme-loader.test.mjs`.

Expected: all loader tests pass.

- [ ] **Step 3: Add visual contract assertions and verify red state**

```js
for (const variable of [
  "character-size", "character-position",
  "character-size-narrow", "character-position-narrow",
]) assert.match(renderer, new RegExp(`--theme-${variable}`));

assert.match(css, /var\(--theme-character-position\)\s*\/\s*var\(--theme-character-size\)/);
assert.match(css, /var\(--theme-character-position-narrow\)\s*\/\s*var\(--theme-character-size-narrow\)/);
```

Run `node --test windows/tests/visual-contract.test.mjs`.

Expected: failure until the renderer and CSS consume the fields.

- [ ] **Step 4: Map variables and replace fixed CSS**

Add the four names to `THEME_VARIABLES`, map the values with the same defaults, increment renderer `VERSION`, and use:

```css
var(--dream-character) var(--theme-character-position) / var(--theme-character-size) no-repeat,
```

Desktop and:

```css
var(--dream-character) var(--theme-character-position-narrow) / var(--theme-character-size-narrow) no-repeat,
```

Inside the narrow media query. Declare the four defaults in `:root.codex-dream-skin`.

- [ ] **Step 5: Run targeted tests and commit**

```powershell
node --test windows/tests/theme-loader.test.mjs windows/tests/visual-contract.test.mjs
git add windows/scripts/theme-loader.mjs windows/assets/renderer-inject.js windows/assets/dream-skin.css windows/tests/theme-loader.test.mjs windows/tests/visual-contract.test.mjs
git commit -m "feat(windows): support per-theme character placement"
```

Expected: zero failures before commit.

### Task 3: Require Real Character Assets for Every Finished Theme

**Files:**
- Modify: `windows/tests/test_theme_assets.py`

- [ ] **Step 1: Replace the flattened-theme assertion**

```python
def test_every_finished_theme_has_a_real_foreground(self):
    required_layout = {
        "characterSize", "characterPosition",
        "characterSizeNarrow", "characterPositionNarrow",
    }
    for theme_id, (root, config) in self.themes.items():
        with self.subTest(theme=theme_id):
            self.assertIn("character", config)
            self.assertTrue(required_layout.issubset(config["layout"]))
            foreground_path = root / config["character"]
            self.assertLess(foreground_path.stat().st_size, 16 * 1024 * 1024)
            with Image.open(foreground_path) as foreground:
                self.assertEqual(foreground.mode, "RGBA")
                alpha = foreground.getchannel("A")
                self.assertIsNotNone(alpha.getbbox())
                corners = [
                    alpha.getpixel((0, 0)),
                    alpha.getpixel((foreground.width - 1, 0)),
                    alpha.getpixel((0, foreground.height - 1)),
                    alpha.getpixel((foreground.width - 1, foreground.height - 1)),
                ]
                self.assertEqual(corners, [0, 0, 0, 0])
```

- [ ] **Step 2: Verify red state and keep it red until assets exist**

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
& 'D:\CodexTools\python\Scripts\python.exe' -m unittest windows.tests.test_theme_assets -v
```

Expected: four flattened themes fail. Do not exclude them or create transparent placeholder people.

### Task 4: Build the Temporary Asset Workspace

**Files:**
- Create temporary: `D:\Cache\Codex-Dream-Skin\layered-theme-rebuild-2026-07-19\tools\prepare-layered-assets.py`
- Do not modify tracked files in this task.

- [ ] **Step 1: Create the cache tree and isolated environment**

```powershell
$root='D:\Cache\Codex-Dream-Skin\layered-theme-rebuild-2026-07-19'
New-Item -ItemType Directory -Force -Path "$root\sources","$root\backgrounds","$root\cutouts","$root\previews","$root\screenshots","$root\tools","$root\models" | Out-Null
& 'D:\CodexTools\python\Scripts\python.exe' -m venv "$root\venv"
& "$root\venv\Scripts\python.exe" -m pip install 'rembg[cpu,cli]' pillow numpy onnxruntime
```

Set `U2NET_HOME=$root\models` for every `rembg` invocation so model weights stay off C drive.

- [ ] **Step 2: Create an asset normalization helper in the cache**

Implement these complete core functions and expose `background`, `cutout`, and `checker` argparse subcommands with `--input` and `--out`:

```python
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageOps

MAX_BYTES = 16 * 1024 * 1024


def save_background(source: Path, target: Path) -> None:
    image = Image.open(source).convert("RGB")
    image = ImageOps.fit(image, (3840, 2160), Image.Resampling.LANCZOS)
    image.save(target, "JPEG", quality=92, subsampling=0, optimize=True)
    if target.stat().st_size >= MAX_BYTES:
        raise ValueError("background exceeds loader limit")


def save_cutout(source: Path, target: Path, padding: int = 32) -> None:
    image = Image.open(source).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("cutout alpha is empty")
    left = max(0, bbox[0] - padding)
    top = max(0, bbox[1] - padding)
    right = min(image.width, bbox[2] + padding)
    bottom = min(image.height, bbox[3] + padding)
    image = image.crop((left, top, right, bottom))
    padded = Image.new("RGBA", (image.width + 2, image.height + 2), (0, 0, 0, 0))
    padded.alpha_composite(image, (1, 1))
    padded.save(target, "PNG", optimize=True)
    if target.stat().st_size >= MAX_BYTES:
        raise ValueError("cutout exceeds loader limit")


def save_checker(source: Path, target: Path) -> None:
    cutout = Image.open(source).convert("RGBA")
    preview = Image.new("RGBA", cutout.size, (36, 38, 43, 255))
    draw = ImageDraw.Draw(preview)
    for y in range(0, preview.height, 32):
        for x in range(0, preview.width, 32):
            if (x // 32 + y // 32) % 2 == 0:
                draw.rectangle((x, y, x + 31, y + 31), fill=(70, 73, 80, 255))
    preview.alpha_composite(cutout)
    preview.convert("RGB").save(target, "JPEG", quality=90, optimize=True)


def merge_alpha(source: Path, primary: Path, secondary: Path, target: Path,
                roi: tuple[float, float, float, float]) -> None:
    original = Image.open(source).convert("RGBA")
    first = Image.open(primary).convert("RGBA").getchannel("A")
    second = Image.open(secondary).convert("RGBA").getchannel("A")
    if first.size != original.size or second.size != original.size:
        raise ValueError("alpha masks must match the source dimensions")
    combined = ImageChops.lighter(first, second)
    mask = Image.new("L", original.size, 0)
    draw = ImageDraw.Draw(mask)
    width, height = original.size
    draw.rectangle(tuple(int(value) for value in (
        roi[0] * width, roi[1] * height, roi[2] * width, roi[3] * height,
    )), fill=255)
    original.putalpha(Image.composite(combined, first, mask))
    original.save(target, "PNG", optimize=True)
```

The `merge-alpha` subcommand accepts `--source`, `--primary`, `--secondary`, four `--roi` floats, and `--out`, then calls `merge_alpha`.

- [ ] **Step 3: Copy immutable source images into the cache**

```powershell
Copy-Item -LiteralPath 'D:\Apps\Codex-Dream-Skin\windows\themes\blue-night-red-eyes\hero.png' -Destination "$root\sources\blue-night-red-eyes-source.png"
Copy-Item -LiteralPath 'D:\Desktop\邓子涵\图片\锁屏\mmexport1753424866028.jpg' -Destination "$root\sources\neon-sakura-city-source.jpg"
Copy-Item -LiteralPath 'D:\Desktop\邓子涵\图片\锁屏\IMG_20240821_203135.png' -Destination "$root\sources\frostbyte-game-room-source.png"
Copy-Item -LiteralPath 'D:\Desktop\邓子涵\图片\锁屏\电脑_upscayl_4x_realesrgan-x4plus.png' -Destination "$root\sources\celestial-tide-source.png"
```

- [ ] **Step 4: Smoke-test helper behavior**

```powershell
& "$root\venv\Scripts\python.exe" "$root\tools\prepare-layered-assets.py" cutout --input 'D:\Apps\Codex-Dream-Skin\windows\themes\xuanjia-chijin\assets\xuanjia-character-cutout.png' --out "$root\cutouts\xuanjia-smoke.png"
& "$root\venv\Scripts\python.exe" "$root\tools\prepare-layered-assets.py" checker --input "$root\cutouts\xuanjia-smoke.png" --out "$root\previews\xuanjia-smoke.jpg"
```

Expected: transparent corners and nonempty alpha; no tracked file changes.

### Task 5: Rebuild Blue Night Red Eyes

**Files:**
- Replace: `windows/themes/blue-night-red-eyes/hero.png` with `hero.jpg`
- Create: `windows/themes/blue-night-red-eyes/assets/blue-night-red-eyes-character-cutout.png`
- Modify: `windows/themes/blue-night-red-eyes/theme.json`

- [ ] **Step 1: Extract original character pixels**

```powershell
$env:U2NET_HOME="$root\models"
& "$root\venv\Scripts\python.exe" -m rembg i -m isnet-anime -a -af 240 -ab 10 -ae 8 "$root\sources\blue-night-red-eyes-source.png" "$root\cutouts\blue-night-red-eyes-raw.png"
& "$root\venv\Scripts\python.exe" "$root\tools\prepare-layered-assets.py" cutout --input "$root\cutouts\blue-night-red-eyes-raw.png" --out "$root\cutouts\blue-night-red-eyes-character-cutout.png"
```

Inspect on a checkerboard. Preserve face, hair, clothing and rim light; reject background glow detached from the figure.

- [ ] **Step 2: Generate only the character-free background with Cockpit**

Prompt:

```text
Use case: precise-object-edit. Asset type: Codex desktop theme background. Remove only the blue-haired red-eyed woman and reconstruct the dark blue atmospheric space hidden behind her. Preserve the same wide framing, empty dark reading space on the left, blue bloom, palette, camera and every unaffected region. Background only: no people, silhouettes, faces, bodies, clothing, text, logos or watermark.
```

```powershell
$prompt='Use case: precise-object-edit. Asset type: Codex desktop theme background. Remove only the blue-haired red-eyed woman and reconstruct the dark blue atmospheric space hidden behind her. Preserve the same wide framing, empty dark reading space on the left, blue bloom, palette, camera and every unaffected region. Background only: no people, silhouettes, faces, bodies, clothing, text, logos or watermark.'
powershell -NoProfile -ExecutionPolicy Bypass -File 'D:\CodexTools\gpttoimage-session\generate-current-account.ps1' -Prompt $prompt -Out "$root\backgrounds\blue-night-red-eyes-v1.png" -Size 1536x1024 -Quality high -Reference "$root\sources\blue-night-red-eyes-source.png"
```

- [ ] **Step 3: Normalize, approve, install, and configure**

Normalize the approved background to `hero.jpg`. Add the cutout reference and:

```json
"characterSize": "auto 88%",
"characterPosition": "right -2vw bottom -4vh",
"characterSizeNarrow": "auto 76%",
"characterPositionNarrow": "right -20vw bottom -2vh"
```

Delete old `hero.png` only after the new hero exists and the config points to it.

- [ ] **Step 4: Commit**

```powershell
git add windows/themes/blue-night-red-eyes
git commit -m "feat(windows): layer the blue night theme"
```

### Task 6: Rebuild Neon Sakura City

**Files:**
- Replace: `windows/themes/neon-sakura-city/hero.jpg`
- Create: `windows/themes/neon-sakura-city/assets/neon-sakura-city-character-cutout.png`
- Modify: `windows/themes/neon-sakura-city/theme.json`

- [ ] **Step 1: Extract the seated figure and phone**

```powershell
$env:U2NET_HOME="$root\models"
& "$root\venv\Scripts\python.exe" -m rembg i -m isnet-anime -a -af 240 -ab 10 -ae 8 "$root\sources\neon-sakura-city-source.jpg" "$root\cutouts\neon-sakura-city-raw.png"
& "$root\venv\Scripts\python.exe" "$root\tools\prepare-layered-assets.py" cutout --input "$root\cutouts\neon-sakura-city-raw.png" --out "$root\cutouts\neon-sakura-city-character-cutout.png"
```

Include the full pink-haired figure, clothing, legs, hair tips and phone; exclude window bench, railing and city.

- [ ] **Step 2: Generate the pure background with Cockpit**

```text
Use case: precise-object-edit. Remove only the seated pink-haired woman and her phone. Reconstruct the window bench, railing, glass and neon city hidden behind her. Preserve exact perspective, pale pink-violet lighting, left open reading area, window geometry and camera. Background only: no people, hair, phones, text, logos or watermark; keep unaffected regions unchanged.
```

```powershell
$prompt='Use case: precise-object-edit. Remove only the seated pink-haired woman and her phone. Reconstruct the window bench, railing, glass and neon city hidden behind her. Preserve exact perspective, pale pink-violet lighting, left open reading area, window geometry and camera. Background only: no people, hair, phones, text, logos or watermark; keep unaffected regions unchanged.'
powershell -NoProfile -ExecutionPolicy Bypass -File 'D:\CodexTools\gpttoimage-session\generate-current-account.ps1' -Prompt $prompt -Out "$root\backgrounds\neon-sakura-city-v1.png" -Size 1536x1024 -Quality high -Reference "$root\sources\neon-sakura-city-source.jpg"
```

- [ ] **Step 3: Reject defects, install, and configure**

Reject bent frames, duplicate rails, person-shaped haze, or bench/glass pixels attached to hair and legs. Seed:

```json
"characterSize": "auto 74%",
"characterPosition": "right -2vw bottom -3vh",
"characterSizeNarrow": "auto 62%",
"characterPositionNarrow": "right -28vw bottom -2vh"
```

- [ ] **Step 4: Commit**

```powershell
git add windows/themes/neon-sakura-city
git commit -m "feat(windows): layer the neon sakura theme"
```

### Task 7: Rebuild Frostbyte with Person and Chair as One Foreground

**Files:**
- Replace: `windows/themes/frostbyte-game-room/hero.jpg`
- Create: `windows/themes/frostbyte-game-room/assets/frostbyte-game-room-character-cutout.png`
- Modify: `windows/themes/frostbyte-game-room/theme.json`

- [ ] **Step 1: Produce person and general-object mattes**

```powershell
$env:U2NET_HOME="$root\models"
& "$root\venv\Scripts\python.exe" -m rembg i -m isnet-anime -a -af 240 -ab 10 -ae 8 "$root\sources\frostbyte-game-room-source.png" "$root\cutouts\frostbyte-person.png"
& "$root\venv\Scripts\python.exe" -m rembg i -m birefnet-general -a -af 240 -ab 10 -ae 6 "$root\sources\frostbyte-game-room-source.png" "$root\cutouts\frostbyte-group.png"
```

Merge alpha only inside normalized ROI `x=0.18..0.76`, `y=0.10..1.00`, using original source RGB:

```powershell
& "$root\venv\Scripts\python.exe" "$root\tools\prepare-layered-assets.py" merge-alpha --source "$root\sources\frostbyte-game-room-source.png" --primary "$root\cutouts\frostbyte-person.png" --secondary "$root\cutouts\frostbyte-group.png" --roi 0.18 0.10 0.76 1.00 --out "$root\cutouts\frostbyte-merged.png"
& "$root\venv\Scripts\python.exe" "$root\tools\prepare-layered-assets.py" cutout --input "$root\cutouts\frostbyte-merged.png" --out "$root\cutouts\frostbyte-game-room-character-cutout.png"
```

Include girl, hair, clothes, legs, shoes, controller, its cable, full chair seat/back/headrest and red trim. Exclude desk, speakers, computers, monitors and unrelated floor cables.

- [ ] **Step 2: Generate the empty room with Cockpit**

```text
Use case: precise-object-edit. Remove the white-haired girl, controller and cable, and the entire black-and-red gaming chair. Reconstruct the room, floor, desk edges, wall and equipment hidden behind the group. Preserve wide-angle camera, cool-gray light, window shadows, computers, speakers, monitors, plants and left floor. No people, chair fragments, text, logos or watermark.
```

```powershell
$prompt='Use case: precise-object-edit. Remove the white-haired girl, controller and cable, and the entire black-and-red gaming chair. Reconstruct the room, floor, desk edges, wall and equipment hidden behind the group. Preserve wide-angle camera, cool-gray light, window shadows, computers, speakers, monitors, plants and left floor. No people, chair fragments, text, logos or watermark.'
powershell -NoProfile -ExecutionPolicy Bypass -File 'D:\CodexTools\gpttoimage-session\generate-current-account.ps1' -Prompt $prompt -Out "$root\backgrounds\frostbyte-game-room-v1.png" -Size 1536x1024 -Quality high -Reference "$root\sources\frostbyte-game-room-source.png"
```

- [ ] **Step 3: Reject defects, install, and configure**

Reject duplicate speakers, warped perspective, chair fragments or human shapes. Seed:

```json
"characterSize": "auto 86%",
"characterPosition": "right -4vw bottom -4vh",
"characterSizeNarrow": "auto 72%",
"characterPositionNarrow": "right -25vw bottom -3vh"
```

- [ ] **Step 4: Commit**

```powershell
git add windows/themes/frostbyte-game-room
git commit -m "feat(windows): layer the frostbyte game room"
```

### Task 8: Rebuild Celestial Tide

**Files:**
- Replace: `windows/themes/celestial-tide/hero.jpg`
- Create: `windows/themes/celestial-tide/assets/celestial-tide-character-cutout.png`
- Modify: `windows/themes/celestial-tide/theme.json`

- [ ] **Step 1: Extract the standing figure**

```powershell
$env:U2NET_HOME="$root\models"
& "$root\venv\Scripts\python.exe" -m rembg i -m isnet-anime -a -af 240 -ab 10 -ae 8 "$root\sources\celestial-tide-source.png" "$root\cutouts\celestial-tide-raw.png"
& "$root\venv\Scripts\python.exe" "$root\tools\prepare-layered-assets.py" cutout --input "$root\cutouts\celestial-tide-raw.png" --out "$root\cutouts\celestial-tide-character-cutout.png"
```

Preserve woman, hair, clothing, horn ornament and light/water ribbons touching the body. Exclude ocean, horizon, star field and detached distant light.

- [ ] **Step 2: Generate the pure background with Cockpit**

```text
Use case: precise-object-edit. Remove only the white-haired woman and attached light/water ribbons. Reconstruct star field, luminous sky, ocean horizon and water surface behind her. Preserve deep blue palette, horizon height, upper-left nebula and open reading space. No people, character-shaped light, text, logos or watermark.
```

```powershell
$prompt='Use case: precise-object-edit. Remove only the white-haired woman and attached light and water ribbons. Reconstruct star field, luminous sky, ocean horizon and water surface behind her. Preserve deep blue palette, horizon height, upper-left nebula and open reading space. No people, character-shaped light, text, logos or watermark.'
powershell -NoProfile -ExecutionPolicy Bypass -File 'D:\CodexTools\gpttoimage-session\generate-current-account.ps1' -Prompt $prompt -Out "$root\backgrounds\celestial-tide-v1.png" -Size 1536x1024 -Quality high -Reference "$root\sources\celestial-tide-source.png"
```

- [ ] **Step 3: Reject defects, install, and configure**

Reject star pixels trapped in hair, broken horizon, person-shaped bright patches or a new focal subject. Seed:

```json
"characterSize": "auto 94%",
"characterPosition": "right -3vw bottom -5vh",
"characterSizeNarrow": "auto 80%",
"characterPositionNarrow": "right -20vw bottom -4vh"
```

- [ ] **Step 4: Commit**

```powershell
git add windows/themes/celestial-tide
git commit -m "feat(windows): layer the celestial tide theme"
```

### Task 9: Make Xuanjia Explicit and Bring Asset Tests Green

**Files:**
- Modify: `windows/themes/xuanjia-chijin/theme.json`
- Modify: `windows/tests/test_theme_assets.py`

- [ ] **Step 1: Add explicit Xuanjia placement without replacing art**

```json
"characterSize": "auto 94%",
"characterPosition": "right -5vw bottom -5vh",
"characterSizeNarrow": "auto 82%",
"characterPositionNarrow": "right -18vw bottom -4vh"
```

- [ ] **Step 2: Run five-theme asset and full automated tests**

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
& 'D:\CodexTools\python\Scripts\python.exe' -m unittest windows.tests.test_theme_assets -v
node --test windows/tests/*.test.mjs
& 'D:\CodexTools\python\Scripts\python.exe' -m unittest discover -s windows/tests -p 'test_*.py' -v
```

Expected: all five themes pass character path, RGBA, alpha, transparent corners, layout, aspect-ratio and size checks; all Node/Python tests report zero failures.

- [ ] **Step 3: Commit**

```powershell
git add windows/themes/xuanjia-chijin/theme.json windows/tests/test_theme_assets.py
git commit -m "test(windows): require layered finished themes"
```

### Task 10: Update Authoring and Public Documentation

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `windows/THEME_AUTHORING.md`
- Modify: `windows/references/qa-inventory.md`

- [ ] **Step 1: Remove flattened-scene claims**

Describe all five finished themes as pure scene plus transparent foreground. Remove statements saying Blue Night or the three recent themes omit a character layer.

- [ ] **Step 2: Document the four layout fields and grouping rule**

Update the example JSON with `character`, `characterSize`, `characterPosition`, `characterSizeNarrow`, and `characterPositionNarrow`. Explain accepted values and compatibility defaults. State that supporting objects can join the foreground when spatially inseparable; use Frostbyte person/controller/cable/gaming-chair as the example.

- [ ] **Step 3: Check obsolete wording and commit**

```powershell
rg -n "flattened|一体背景|省略.*character|不配置额外人物" README.md README.en.md windows/THEME_AUTHORING.md windows/references/qa-inventory.md
git diff --check
git add README.md README.en.md windows/THEME_AUTHORING.md windows/references/qa-inventory.md
git commit -m "docs(windows): document layered theme packs"
```

Expected: no obsolete finished-theme claims and no whitespace errors.

### Task 11: Tune Every Theme in the Real Codex Window

**Files:**
- Modify after screenshot evidence identifies placement defects: the affected `windows/themes/*/theme.json` files
- Temporary screenshots: cache `screenshots` directory

- [ ] **Step 1: Start a debuggable Codex session on port 9335**

Use existing start/switch scripts. Do not change Codex program files, threads, plugins, login or pets.

- [ ] **Step 2: Verify every theme on home and task pages at 1600×900**

Capture screenshots. Require intentional character crop, face and primary silhouette on the right, readable navigation/project picker/cards/composer, and no residual duplicate person in the pure background.

- [ ] **Step 3: Repeat at 1280×800**

Tune only the four layout values. Do not add theme-specific CSS selectors or bake placement into hero art.

- [ ] **Step 4: Verify switching and reload**

Hot-switch all five IDs in both directions. Reload the renderer. Confirm ID, hero, character, palette and layout update together with one style node.

- [ ] **Step 5: Restore official appearance after QA**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'D:\Apps\Codex-Dream-Skin\windows\scripts\restore-dream-skin.ps1' -Port 9335 -RestoreBaseTheme -RestartExisting
```

Expected: live injection removed, pre-install appearance restored, theme shortcuts retained.

- [ ] **Step 6: Commit layout tuning if it changed**

```powershell
git add windows/themes/*/theme.json
git commit -m "fix(windows): tune layered theme compositions"
```

Skip only when `git diff -- windows/themes/*/theme.json` is empty.

### Task 12: Final Verification, Cleanup, and Publication

**Files:**
- No new product files expected.
- Delete the cache tree only after final art is verified and committed.

- [ ] **Step 1: Run a fresh complete verification suite**

```powershell
$ErrorActionPreference='Stop'
node --test windows/tests/*.test.mjs
$env:PYTHONDONTWRITEBYTECODE='1'
& 'D:\CodexTools\python\Scripts\python.exe' -m unittest discover -s windows/tests -p 'test_*.py' -v
Get-ChildItem -LiteralPath windows\scripts -Filter *.mjs -File | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax check failed: $($_.FullName)" } }
$parseErrors=@()
Get-ChildItem -LiteralPath windows\scripts -Filter *.ps1 -File | ForEach-Object {
  $tokens=$null; $errors=$null
  [System.Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$tokens,[ref]$errors) | Out-Null
  if ($errors) { $parseErrors += $errors }
}
if ($parseErrors.Count -gt 0) { throw 'PowerShell parse errors found' }
git diff --check
```

Expected: zero test, syntax, parse or whitespace failures.

- [ ] **Step 2: Audit tracked files and privacy**

```powershell
git status --short
git ls-files | rg "layered-theme-rebuild|screenshots|sources|previews"
```

Expected: no cache source, helper, screenshot, username or project screenshot is tracked. Only final art, configs, runtime, tests and docs remain.

- [ ] **Step 3: Delete only the verified cache tree**

Resolve `D:\Cache\Codex-Dream-Skin\layered-theme-rebuild-2026-07-19`, verify the absolute path remains below `D:\Cache\Codex-Dream-Skin\`, then remove that exact directory recursively. Do not touch original source images or the repository.

- [ ] **Step 4: Fetch without overwriting remote changes**

```powershell
git fetch publish main
git rev-list --left-right --count FETCH_HEAD...HEAD
```

Integrate remote-only commits if the left count is nonzero. Never force push.

- [ ] **Step 5: Push and verify hashes**

```powershell
git push publish HEAD:main
git fetch publish main
git rev-parse HEAD
git rev-parse FETCH_HEAD
git status --porcelain=v1
```

Expected: local and remote hashes identical and worktree empty.

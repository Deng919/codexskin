# Windows Theme Pack Design

## Goal

Replace the Windows-only hard-coded Fiona skin with a data-driven theme package system, then ship `xuanjia-chijin` as the first complete theme using the user's red, black, and gold warrior artwork.

## Theme Package

Each theme lives under `windows/themes/<theme-id>/` and contains:

- `theme.json`: validated palette, image filenames, and layout tuning.
- `hero.png`: the primary banner artwork.
- `texture.png`: a low-contrast supporting texture for shell surfaces and decoration.

The initial schema is version 1. It contains `id`, `name`, `hero`, `texture`, `colors`, and `layout`. `name` is internal metadata only and is never rendered into Codex. Image fields must be basenames so themes cannot read outside their own directory.

## Runtime Flow

`start-dream-skin.ps1` accepts an optional `-ThemeId` and otherwise reads `windows/active-theme.txt`. It resolves the theme under `windows/themes`, passes the directory to `injector.mjs`, and records the selected theme in runtime state.

`injector.mjs` validates the schema, colors, image types, file sizes, and path containment. It embeds the theme JSON and both images as data URLs in the renderer payload. Invalid themes fail before renderer injection and do not fall back silently.

`renderer-inject.js` maps theme colors and layout values to CSS custom properties. It must not replace, hide, or supplement Codex interface copy. The existing native Codex controls and text remain untouched and interactive. Decorative elements remain text-free and `pointer-events: none`.

## Xuanjia Chijin Theme

The theme uses charcoal black, oxblood red, dark crimson, antique gold, warm ivory, and cool steel gray. It removes all Fiona, heart, bow, pink, and purple references. It adds no replacement title, subtitle, tagline, status, quote, project label, or other visible copy.

The supplied warrior artwork remains the hero image. A generated supporting texture derives only the palette and material language: blackened metal, worn red lacquer, restrained gold linework, and drifting snow. It contains no person, text, logo, watermark, or visually dominant object.

## Compatibility And Recovery

- Keep loopback-only CDP behavior and do not modify the Store package or `app.asar`.
- Preserve the existing config backup and restore shortcuts.
- Preserve the original Fiona artwork as `windows/assets/dream-reference.fiona-original.png`.
- Keep the current theme usable at 1280x720 through ultrawide desktop sizes without overflow.
- A Codex DOM change must fail verification instead of reporting a successful theme load.

## Verification

- Parse-check all PowerShell and JavaScript files.
- Unit-test theme validation with valid, invalid, traversal, missing-file, and oversized-file cases.
- Launch an isolated Codex profile on loopback CDP.
- Verify the injection marker, native sidebar, native composer, suggestion cards, pointer-event behavior, and no document overflow.
- Capture and inspect desktop screenshots for native-text contrast, hero crop, decorative overlap, removal of Fiona/pink copy, and absence of newly injected visible copy.

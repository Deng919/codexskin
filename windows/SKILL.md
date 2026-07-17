---
name: codex-dream-skin
description: Build, apply, switch, verify, repair, update, or restore decorative theme packs for the Windows Codex desktop app without modifying WindowsApps or app.asar.
---

# Codex Dream Skin

Apply a reversible renderer skin through Chromium DevTools Protocol while launching the official Store-installed Codex executable. Never replace or take ownership of files under `WindowsApps`.

## Workflow

1. Run `scripts/install-dream-skin.ps1` once to set the matching official base colors and create launch/restore shortcuts.
2. Run `scripts/start-dream-skin.ps1`. Add `-RestartExisting` only when the user authorized restarting an already-open Codex app.
3. Use `scripts/switch-dream-skin.ps1 -ThemeId <id>` or a generated per-theme shortcut to persist and hot-switch theme packs.
4. Run `scripts/verify-dream-skin.ps1 -ScreenshotPath <absolute-path>` after launch. Treat a missing full-window scene, native composer, sidebar skin, or injection marker as failure. The native suggestion count is responsive and may be two to four.
5. Inspect the screenshot against `references/qa-inventory.md`. Verify both the home screen and a normal task before signing off.
6. Run `scripts/restore-dream-skin.ps1` for live removal. Add `-Uninstall` to delete shortcuts; add `-RestoreBaseTheme` when the user also wants the pre-install config backup restored.

## Guardrails

- Preserve the official executable, package signature, user threads, pets, plugins, and authentication state.
- Use the theme scene as a shared background for the home and task views while keeping all controls live Codex controls.
- Do not add a custom avatar or a separate foreground character to the home view. Keep native labels, icons, suggestion buttons, and composer controls unchanged.
- Attach the "选择项目" treatment to Codex's real project-selector toolbar and keep the current project button clickable; never draw a disconnected replacement.
- Keep decorative layers `pointer-events: none` and keep real buttons, navigation, and composer above them.
- On app updates, rerun install and launch; the scripts discover the current Appx package dynamically.
- If port `9335` is occupied, choose another port consistently for start, verify, and restore.
- Keep the injection daemon running for navigation/reload resilience. Its state and logs live under `%LOCALAPPDATA%\CodexDreamSkin`.

## Resources

- `scripts/injector.mjs`: CDP connection, renderer injection, verification, screenshot, and removal.
- `scripts/switch-dream-skin.ps1`: active-theme persistence and live injector switching.
- `assets/dream-skin.css`: full visual layer.
- `assets/renderer-inject.js`: idempotent DOM integration and cleanup.
- `themes/<id>/`: self-contained theme packs with scene, texture, compatibility assets, and semantic colors.
- `THEME_AUTHORING.md`: the production workflow used for the included Windows themes.
- `references/qa-inventory.md`: required functional and visual signoff coverage.
- `references/runtime-notes.md`: troubleshooting and update behavior.

[CmdletBinding()]
param(
  [int]$Port = 9335,
  [string]$ThemeId,
  [switch]$NoShortcuts
)

$ErrorActionPreference = 'Stop'
$SkillRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
$ThemeRoot = Join-Path $SkillRoot 'themes'
$ActiveThemePath = Join-Path $SkillRoot 'active-theme.txt'
if ([string]::IsNullOrWhiteSpace($ThemeId)) {
  if (-not (Test-Path -LiteralPath $ActiveThemePath)) { throw "Active theme file not found: $ActiveThemePath" }
  $ThemeId = (Get-Content -LiteralPath $ActiveThemePath -Raw).Trim()
}
if ($ThemeId -notmatch '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$') { throw "Invalid theme id: $ThemeId" }
$ThemeDir = Join-Path $ThemeRoot $ThemeId
$ThemeConfigPath = Join-Path $ThemeDir 'theme.json'
if (-not (Test-Path -LiteralPath $ThemeConfigPath)) { throw "Theme not found: $ThemeId" }
$ThemeConfig = Get-Content -LiteralPath $ThemeConfigPath -Raw -Encoding utf8 | ConvertFrom-Json
$ConfigPath = Join-Path $HOME '.codex\config.toml'
$BackupPath = Join-Path $StateRoot 'config.before-dream-skin.toml'
if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Codex config not found: $ConfigPath" }
if (-not (Test-Path -LiteralPath $BackupPath)) { Copy-Item -LiteralPath $ConfigPath -Destination $BackupPath }

$content = Get-Content -LiteralPath $ConfigPath -Raw
$desktopMatch = [regex]::Match($content, '(?ms)^\[desktop\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
if (-not $desktopMatch.Success) {
  $content = $content.TrimEnd() + "`r`n`r`n[desktop]`r`n"
  $desktopMatch = [regex]::Match($content, '(?ms)^\[desktop\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
}
$body = $desktopMatch.Groups['body'].Value
$settings = [ordered]@{
  appearanceTheme = 'appearanceTheme = "dark"'
  appearanceDarkCodeThemeId = 'appearanceDarkCodeThemeId = "codex"'
  appearanceDarkChromeTheme = "appearanceDarkChromeTheme = { accent = `"$($ThemeConfig.colors.accent)`", contrast = 70, fonts = { code = `"Cascadia Code`", ui = `"Microsoft YaHei UI`" }, ink = `"$($ThemeConfig.colors.text)`", opaqueWindows = true, semanticColors = { diffAdded = `"#3D7A59`", diffRemoved = `"#A83A43`", skill = `"$($ThemeConfig.colors.gold)`" }, surface = `"$($ThemeConfig.colors.background)`" }"
}
foreach ($key in $settings.Keys) {
  $pattern = "(?m)^$([regex]::Escape($key))\s*=.*$"
  if ([regex]::IsMatch($body, $pattern)) { $body = [regex]::Replace($body, $pattern, $settings[$key]) }
  else { $body = $body.TrimEnd() + "`r`n" + $settings[$key] + "`r`n" }
}
$content = $content.Substring(0, $desktopMatch.Groups['body'].Index) + $body + $content.Substring($desktopMatch.Groups['body'].Index + $desktopMatch.Groups['body'].Length)
Set-Content -LiteralPath $ConfigPath -Value $content -Encoding utf8

if (-not $NoShortcuts) {
  $shell = New-Object -ComObject WScript.Shell
  $desktop = [Environment]::GetFolderPath('Desktop')
  $desktopThemeFolderName = 'Codex ' + ([char[]](0x76AE,0x80A4,0x5207,0x6362) -join '')
  $desktopThemeFolder = Join-Path $desktop $desktopThemeFolderName
  New-Item -ItemType Directory -Path $desktopThemeFolder -Force | Out-Null
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  $powershell = (Get-Command powershell.exe).Source
  $switchScript = Join-Path $PSScriptRoot 'switch-dream-skin.ps1'
  $restoreScript = Join-Path $PSScriptRoot 'restore-dream-skin.ps1'
  $ShortcutIcon = Join-Path $SkillRoot 'assets\codex-shortcut.ico'
  if (-not (Test-Path -LiteralPath $ShortcutIcon)) { throw "Shortcut icon not found: $ShortcutIcon" }
  $themeFolders = @(Get-ChildItem -LiteralPath $ThemeRoot -Directory | Where-Object {
    Test-Path -LiteralPath (Join-Path $_.FullName 'theme.json')
  })
  foreach ($folder in @($desktopThemeFolder, $startMenu)) {
    Remove-Item -LiteralPath (Join-Path $folder 'Codex Dream Skin.lnk') -Force -ErrorAction SilentlyContinue
    foreach ($existingShortcut in @(Get-ChildItem -LiteralPath $folder -Filter 'Codex - *.lnk' -File -ErrorAction SilentlyContinue)) {
      $existingLink = $shell.CreateShortcut($existingShortcut.FullName)
      if ($existingLink.Arguments -like "*$switchScript*") {
        Remove-Item -LiteralPath $existingShortcut.FullName -Force
      }
    }
    foreach ($themeFolder in $themeFolders) {
      $legacyLabel = (Get-Culture).TextInfo.ToTitleCase(($themeFolder.Name -replace '-', ' '))
      Remove-Item -LiteralPath (Join-Path $folder "Codex Dream Skin - $legacyLabel.lnk") -Force -ErrorAction SilentlyContinue
      $shortcutTheme = Get-Content -LiteralPath (Join-Path $themeFolder.FullName 'theme.json') -Raw -Encoding utf8 | ConvertFrom-Json
      $shortcutLabel = if ([string]::IsNullOrWhiteSpace($shortcutTheme.shortcutName)) {
        (Get-Culture).TextInfo.ToTitleCase(($themeFolder.Name -replace '-', ' '))
      } else {
        [string]$shortcutTheme.shortcutName
      }
      $shortcut = $shell.CreateShortcut((Join-Path $folder "Codex - $shortcutLabel.lnk"))
      $shortcut.TargetPath = $powershell
      $shortcut.Arguments = "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$switchScript`" -Port $Port -ThemeId `"$($themeFolder.Name)`" -RestartExisting"
      $shortcut.WorkingDirectory = $SkillRoot
      $shortcut.IconLocation = "$ShortcutIcon,0"
      $shortcut.Description = "Switch Codex to the $shortcutLabel visual theme"
      $shortcut.Save()
    }
  }
  $restore = $shell.CreateShortcut((Join-Path $desktopThemeFolder 'Codex Dream Skin - Restore.lnk'))
  $restore.TargetPath = $powershell
  $restore.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$restoreScript`" -Port $Port"
  $restore.WorkingDirectory = $SkillRoot
  $restore.IconLocation = "$ShortcutIcon,0"
  $restore.Description = 'Remove the live Codex Dream Skin'
  $restore.Save()
}

Write-Host 'Codex Dream Skin installed. Launch or switch themes with the created shortcuts.'

[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$Uninstall,
  [switch]$RestoreBaseTheme
)

$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
$injector = Join-Path $PSScriptRoot 'injector.mjs'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$StatePath = Join-Path $StateRoot 'state.json'

if (Test-Path -LiteralPath $StatePath) {
  try {
    $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    if ($state.injectorPid) { Stop-Process -Id ([int]$state.injectorPid) -Force -ErrorAction SilentlyContinue }
  } catch {}
  Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 250
try { & $node $injector --remove --port $Port --timeout-ms 3000 } catch {}

if ($Uninstall) {
  $desktop = [Environment]::GetFolderPath('Desktop')
  $desktopThemeFolderName = 'Codex ' + ([char[]](0x76AE,0x80A4,0x5207,0x6362) -join '')
  $desktopThemeFolder = Join-Path $desktop $desktopThemeFolderName
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  $switchScript = Join-Path $PSScriptRoot 'switch-dream-skin.ps1'
  $restoreScript = Join-Path $PSScriptRoot 'restore-dream-skin.ps1'
  $shell = New-Object -ComObject WScript.Shell
  foreach ($folder in @($desktopThemeFolder, $startMenu)) {
    if (-not (Test-Path -LiteralPath $folder)) { continue }
    foreach ($shortcutFile in @(Get-ChildItem -LiteralPath $folder -Filter 'Codex*.lnk' -File -ErrorAction SilentlyContinue)) {
      $shortcut = $shell.CreateShortcut($shortcutFile.FullName)
      if ($shortcut.Arguments -like "*$switchScript*" -or $shortcut.Arguments -like "*$restoreScript*") {
        Remove-Item -LiteralPath $shortcutFile.FullName -Force
      }
    }
  }
  @(
    (Join-Path $desktop 'Codex Dream Skin.lnk'),
    (Join-Path $desktop 'Codex Dream Skin - Restore.lnk'),
    (Join-Path $startMenu 'Codex Dream Skin.lnk')
  ) | ForEach-Object { Remove-Item -LiteralPath $_ -Force -ErrorAction SilentlyContinue }
  if ((Test-Path -LiteralPath $desktopThemeFolder) -and
      -not (Get-ChildItem -LiteralPath $desktopThemeFolder -Force | Select-Object -First 1)) {
    Remove-Item -LiteralPath $desktopThemeFolder -Force
  }
}

if ($RestoreBaseTheme) {
  $backup = Join-Path $StateRoot 'config.before-dream-skin.toml'
  $config = Join-Path $HOME '.codex\config.toml'
  if (-not (Test-Path -LiteralPath $backup)) { throw 'No pre-install config backup is available.' }
  $backupContent = Get-Content -LiteralPath $backup -Raw
  $currentContent = Get-Content -LiteralPath $config -Raw
  foreach ($key in @(
    'appearanceTheme',
    'appearanceLightCodeThemeId',
    'appearanceLightChromeTheme',
    'appearanceDarkCodeThemeId',
    'appearanceDarkChromeTheme'
  )) {
    $pattern = "(?m)^$([regex]::Escape($key))\s*=.*(?:\r?\n)?"
    $saved = [regex]::Match($backupContent, $pattern)
    if ([regex]::IsMatch($currentContent, $pattern)) {
      $replacement = if ($saved.Success) { $saved.Value.TrimEnd("`r", "`n") + "`r`n" } else { '' }
      $currentContent = [regex]::Replace($currentContent, $pattern, $replacement, 1)
    } elseif ($saved.Success) {
      $desktop = [regex]::Match($currentContent, '(?ms)^\[desktop\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
      if (-not $desktop.Success) {
        $currentContent = $currentContent.TrimEnd() + "`r`n`r`n[desktop]`r`n"
        $desktop = [regex]::Match($currentContent, '(?ms)^\[desktop\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
      }
      $body = $desktop.Groups['body'].Value.TrimEnd() + "`r`n" + $saved.Value.TrimEnd("`r", "`n") + "`r`n"
      $currentContent = $currentContent.Substring(0, $desktop.Groups['body'].Index) + $body +
        $currentContent.Substring($desktop.Groups['body'].Index + $desktop.Groups['body'].Length)
    }
  }
  Set-Content -LiteralPath $config -Value $currentContent -Encoding utf8
}

Write-Host 'The live Dream Skin was removed.'

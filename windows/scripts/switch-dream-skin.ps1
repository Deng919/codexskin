[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ThemeId,
  [int]$Port = 9335,
  [switch]$RestartExisting
)

$ErrorActionPreference = 'Stop'
$SkillRoot = Split-Path -Parent $PSScriptRoot
$ThemeRoot = Join-Path $SkillRoot 'themes'
$ActiveThemePath = Join-Path $SkillRoot 'active-theme.txt'

if ($ThemeId -notmatch '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$') {
  throw "Invalid theme id: $ThemeId"
}
$ThemeRootFull = [System.IO.Path]::GetFullPath($ThemeRoot)
$ThemeDir = [System.IO.Path]::GetFullPath((Join-Path $ThemeRootFull $ThemeId))
if (-not $ThemeDir.StartsWith($ThemeRootFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Theme path escaped the theme root: $ThemeDir"
}
if (-not (Test-Path -LiteralPath (Join-Path $ThemeDir 'theme.json'))) {
  throw "Theme not found: $ThemeId"
}

Set-Content -LiteralPath $ActiveThemePath -Value $ThemeId -Encoding ascii

$installScript = Join-Path $PSScriptRoot 'install-dream-skin.ps1'
& $installScript -Port $Port -ThemeId $ThemeId -NoShortcuts

$startScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'
$startArguments = @{ Port = $Port; ThemeId = $ThemeId }
if ($RestartExisting) { $startArguments.RestartExisting = $true }
& $startScript @startArguments

[CmdletBinding()]
param(
  [int]$Port = 9335,
  [string]$ScreenshotPath,
  [string]$Viewport
)

$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
$injector = Join-Path $PSScriptRoot 'injector.mjs'
$arguments = @($injector, '--verify', '--port', "$Port")
if ($ScreenshotPath) { $arguments += @('--screenshot', $ScreenshotPath) }
if ($Viewport) { $arguments += @('--viewport', $Viewport) }
& $node @arguments
exit $LASTEXITCODE

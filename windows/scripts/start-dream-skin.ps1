[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$RestartExisting,
  [string]$ProfilePath,
  [string]$ThemeId,
  [switch]$ForegroundInjector
)

$ErrorActionPreference = 'Stop'
$SkillRoot = Split-Path -Parent $PSScriptRoot
$Injector = Join-Path $PSScriptRoot 'injector.mjs'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$StatePath = Join-Path $StateRoot 'state.json'
$StdoutPath = Join-Path $StateRoot 'injector.log'
$StderrPath = Join-Path $StateRoot 'injector-error.log'
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null

$ThemeRoot = Join-Path $SkillRoot 'themes'
$ActiveThemePath = Join-Path $SkillRoot 'active-theme.txt'
if ([string]::IsNullOrWhiteSpace($ThemeId)) {
  if (-not (Test-Path -LiteralPath $ActiveThemePath)) { throw "Active theme file not found: $ActiveThemePath" }
  $ThemeId = (Get-Content -LiteralPath $ActiveThemePath -Raw).Trim()
}
if ($ThemeId -notmatch '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$') { throw "Invalid theme id: $ThemeId" }
$ThemeRootFull = [System.IO.Path]::GetFullPath($ThemeRoot)
$ThemeDir = [System.IO.Path]::GetFullPath((Join-Path $ThemeRootFull $ThemeId))
if (-not $ThemeDir.StartsWith($ThemeRootFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Theme path escaped the theme root: $ThemeDir"
}
if (-not (Test-Path -LiteralPath (Join-Path $ThemeDir 'theme.json'))) { throw "Theme not found: $ThemeId" }

function Test-CodexDebugPort([int]$CandidatePort) {
  try {
    $targets = Invoke-RestMethod "http://127.0.0.1:$CandidatePort/json/list" -TimeoutSec 1
    return [bool]($targets | Where-Object { $_.type -eq 'page' -and $_.url -like 'app://*' })
  } catch {
    return $false
  }
}

function Start-CodexStorePackage([object]$Package, [string[]]$Arguments) {
  if (-not ('CodexDreamSkin.PackageLauncher' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

namespace CodexDreamSkin
{
    [Flags]
    internal enum ActivateOptions
    {
        None = 0
    }

    [ComImport]
    [Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IApplicationActivationManager
    {
        [PreserveSig]
        int ActivateApplication(
            [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            [MarshalAs(UnmanagedType.LPWStr)] string arguments,
            ActivateOptions options,
            out uint processId);
    }

    [ComImport]
    [Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
    internal class ApplicationActivationManager
    {
    }

    public static class PackageLauncher
    {
        private static string QuoteArgument(string value)
        {
            if (value.Length > 0 && value.IndexOfAny(new[] { ' ', '\t', '\n', '\v', '"' }) < 0)
            {
                return value;
            }

            var result = new StringBuilder("\"");
            var backslashes = 0;
            foreach (var character in value)
            {
                if (character == '\\')
                {
                    backslashes++;
                    continue;
                }

                if (character == '"')
                {
                    result.Append('\\', (backslashes * 2) + 1);
                    result.Append('"');
                    backslashes = 0;
                    continue;
                }

                result.Append('\\', backslashes);
                backslashes = 0;
                result.Append(character);
            }

            result.Append('\\', backslashes * 2);
            result.Append('"');
            return result.ToString();
        }

        public static uint ActivateApplication(string appUserModelId, string[] arguments)
        {
            var commandLine = string.Join(" ", Array.ConvertAll(arguments, QuoteArgument));
            var manager = (IApplicationActivationManager)new ApplicationActivationManager();
            uint processId;
            var result = manager.ActivateApplication(appUserModelId, commandLine, ActivateOptions.None, out processId);
            Marshal.ThrowExceptionForHR(result);
            return processId;
        }
    }
}
'@
  }

  $appUserModelId = "$($Package.PackageFamilyName)!App"
  return [CodexDreamSkin.PackageLauncher]::ActivateApplication($appUserModelId, $Arguments)
}

$node = (Get-Command node -ErrorAction Stop).Source
$debugReady = Test-CodexDebugPort $Port
$mainProcesses = @(Get-Process ChatGPT -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })

if (-not $debugReady -and -not $ProfilePath -and $mainProcesses.Count -gt 0) {
  if (-not $RestartExisting) {
    throw "Codex is already running without dream-skin debugging on port $Port. Close Codex or rerun with -RestartExisting."
  }
  foreach ($process in $mainProcesses) { [void]$process.CloseMainWindow() }
  Start-Sleep -Seconds 2
  Get-Process ChatGPT -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Milliseconds 600
}

if (-not (Test-CodexDebugPort $Port)) {
  $package = Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
  if (-not $package) { throw 'The OpenAI.Codex Store package is not installed.' }
  $arguments = @("--remote-debugging-port=$Port")
  if ($ProfilePath) {
    New-Item -ItemType Directory -Force -Path $ProfilePath | Out-Null
    $arguments += "--user-data-dir=$ProfilePath"
  }
  [void](Start-CodexStorePackage -Package $package -Arguments $arguments)
}

$deadline = (Get-Date).AddSeconds(30)
while (-not (Test-CodexDebugPort $Port)) {
  if ((Get-Date) -ge $deadline) { throw "Codex did not expose CDP on port $Port within 30 seconds." }
  Start-Sleep -Milliseconds 400
}

if (Test-Path -LiteralPath $StatePath) {
  try {
    $old = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    if ($old.injectorPid) { Stop-Process -Id ([int]$old.injectorPid) -Force -ErrorAction SilentlyContinue }
  } catch {}
}

if ($ForegroundInjector) {
  & $node $Injector --watch --port $Port --theme-dir $ThemeDir
  exit $LASTEXITCODE
}

$injectorArgs = @("`"$Injector`"", '--watch', '--port', "$Port", '--theme-dir', "`"$ThemeDir`"")
$daemon = Start-Process -FilePath $node -ArgumentList $injectorArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
@{
  port = $Port
  injectorPid = $daemon.Id
  startedAt = (Get-Date).ToString('o')
  skillRoot = $SkillRoot
  profilePath = $ProfilePath
  themeId = $ThemeId
  themeDir = $ThemeDir
} | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding utf8

$verified = $false
for ($attempt = 0; $attempt -lt 45; $attempt++) {
  Start-Sleep -Milliseconds 700
  & $node $Injector --verify --port $Port --theme-dir $ThemeDir *> $null
  if ($LASTEXITCODE -eq 0) { $verified = $true; break }
}
if (-not $verified) { throw 'Dream skin launched but verification failed. See injector logs.' }
Write-Host "Codex Dream Skin is active on port $Port."

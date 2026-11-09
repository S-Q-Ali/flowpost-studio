#Requires -Version 5
<#
.SYNOPSIS
  One-command Windows build for the FlowPost Studio desktop app.
.DESCRIPTION
  Emits BOTH artifacts from one checkout, reusing the same `flutter build`
  args and the same installer script the CI release already uses
  (.github/workflows/release-desktop.yml + installer\flowpost.iss):
    - a portable zip : extract and run flowpost.exe, no install.
    - a setup .exe   : the per-user Inno Setup installer.
  Paths are resolved against this script's repo root, so it runs from anywhere.
  Needs: Flutter (windows enabled), the C++ build toolchain, and Inno Setup 6
  for the installer (winget install JRSoftware.InnoSetup).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\build-desktop.ps1
.EXAMPLE
  .\scripts\build-desktop.ps1 -Target portable -Version 1.2.0
#>
[CmdletBinding()]
param(
  # Installer/portable version. Defaults to the version in desktop-flutter\pubspec.yaml.
  [string]$Version = "",
  [ValidateSet('all', 'portable', 'installer')]
  [string]$Target = 'all',
  # --dart-define-from-file, relative to desktop-flutter. prod.json is gitignored.
  [string]$ConfigFile = 'config/prod.json',
  # Skip tool\fetch_ffmpeg.ps1 when the bundled FFmpeg is already present.
  [switch]$SkipFfmpegFetch
)
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$App      = Join-Path $RepoRoot 'desktop-flutter'
$Dist     = Join-Path $RepoRoot 'dist-desktop'
$Release  = Join-Path $App 'build\windows\x64\runner\Release'
$FfmpegBin = Join-Path $App 'third_party\ffmpeg\bin'

if (-not $Version) {
  $line = (Select-String -Path (Join-Path $App 'pubspec.yaml') -Pattern '^\s*version:').Line
  if (-not $line) { throw 'Could not read version from desktop-flutter\pubspec.yaml' }
  # "version: 1.0.0+1" -> "1.0.0" (Inno wants X.Y.Z, no build suffix).
  $Version = ($line -replace '.*version:\s*', '') -replace '\+.*', ''
}

if (-not (Test-Path (Join-Path $App $ConfigFile))) {
  throw "Dart-define config not found: $App\$ConfigFile. Copy dev.example.json or create prod.json first."
}

# The gitignored example configs ship placeholder values, so a build from one
# produces an app that opens on the setup screen instead of a working one.
$configJson = Get-Content (Join-Path $App $ConfigFile) -Raw | ConvertFrom-Json
foreach ($field in 'SUPABASE_URL', 'SUPABASE_ANON_KEY') {
  $value = "$($configJson.$field)"
  if ($value -match 'placeholder|<.*>' -or [string]::IsNullOrWhiteSpace($value)) {
    Write-Warning "$field in $ConfigFile is not a real value - the built app will ask for credentials on first run."
  }
}

function Write-Checksum([string]$Path) {
  # Same "<hash>  <name>" shape the CI release publishes, so one certutil
  # comparison works no matter where the file came from.
  $hash = (Get-FileHash -Algorithm SHA256 $Path).Hash.ToLower()
  "$hash  $(Split-Path -Leaf $Path)" | Set-Content "$Path.sha256" -Encoding ascii
}

Push-Location $App
try {
  '==> flutter pub get'
  flutter pub get

  # The app looks for FFmpeg next to the exe in ffmpeg\bin, so both artifacts
  # bundle third_party\ffmpeg\bin there.
  if (-not $SkipFfmpegFetch -and -not (Test-Path (Join-Path $FfmpegBin 'ffmpeg.exe'))) {
    '==> fetching FFmpeg (tool\fetch_ffmpeg.ps1)'
    & (Join-Path $App 'tool\fetch_ffmpeg.ps1')
  }

  "==> flutter build windows --release ($Version)"
  # A running app locks cnativeapi.dll and the exe, so a from-clean build dies
  # halfway through with a sharing violation.
  if (Get-Process flowpost -ErrorAction SilentlyContinue) {
    throw "flowpost.exe is running. Quit it from the tray icon first, then re-run."
  }
  # Output is captured, not streamed: a failing native command writes to stderr
  # and PowerShell prints that as a native error, which is what let a broken
  # build look like it had continued. The tail is shown when it fails.
  $build = flutter build windows --release --build-name=$Version --dart-define-from-file=$ConfigFile 2>&1
  if ($LASTEXITCODE -ne 0) {
    $build | Select-Object -Last 20 | ForEach-Object { "    $_" }
    throw "flutter build windows failed with exit code $LASTEXITCODE"
  }

  # A running app holds the exe and the linker fails, so name the likely cause.
  $exe = Join-Path $Release 'flowpost.exe'
  if (-not (Test-Path $exe)) {
    throw "no $exe after a build that reported success (is the app still running and holding the file?)"
  }

  New-Item -ItemType Directory -Force -Path $Dist | Out-Null

  if ($Target -in 'all', 'portable') {
    "==> portable zip (flowpost.exe)"
    $stage = Join-Path $Dist "portable\FlowPost-$Version"
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $stage | Out-Null
    Copy-Item -Path (Join-Path $Release '*') -Destination $stage -Recurse
    if (Test-Path $FfmpegBin) {
      $stageFfmpegBin = Join-Path $stage 'ffmpeg\bin'
      New-Item -ItemType Directory -Force -Path $stageFfmpegBin | Out-Null
      Copy-Item -Path (Join-Path $FfmpegBin '*') -Destination $stageFfmpegBin -Recurse -Force
      Copy-Item -Path (Join-Path $FfmpegBin '*') -Destination (Join-Path $stage 'ffmpeg') -Recurse -Force
    }
    $zip = Join-Path $Dist 'FlowPost-portable.zip'
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path $stage -DestinationPath $zip
    Write-Checksum $zip
    "    -> $zip"
  }

  if ($Target -in 'all', 'installer') {
    '==> setup .exe (Inno Setup)'
    # A non-admin install lands under LOCALAPPDATA, not Program Files (x86).
    $iscc = @(
      "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
      "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $iscc) {
      throw "Inno Setup 6 not found (checked Program Files (x86) and LOCALAPPDATA\Programs). Install it: winget install JRSoftware.InnoSetup"
    }
    & $iscc "/DMyAppVersion=$Version" (Join-Path $App 'installer\flowpost.iss')
    if ($LASTEXITCODE -ne 0) { throw "ISCC.exe failed with exit code $LASTEXITCODE" }
    $setup = Join-Path $Dist 'FlowPostNativeSetup.exe'
    if (-not (Test-Path $setup)) { throw "Installer was not produced: $setup" }
    Write-Checksum $setup
    "    -> $setup"
  }

  ''
  "Done. Artifacts are in $Dist (gitignored)."
}
finally {
  Pop-Location
}

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
  for the installer (choco install innosetup --yes).
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
  flutter build windows --release --build-name=$Version --dart-define-from-file=$ConfigFile

  $exe = Get-ChildItem -Path $Release -Filter '*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $exe) { throw "Release output missing under $Release (did the build fail?)" }

  New-Item -ItemType Directory -Force -Path $Dist | Out-Null

  if ($Target -in 'all', 'portable') {
    "==> portable zip ($($exe.Name))"
    $stage = Join-Path $Dist "portable\FlowPost-$Version"
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $stage | Out-Null
    Copy-Item -Path (Join-Path $Release '*') -Destination $stage -Recurse
    if (Test-Path $FfmpegBin) {
      Copy-Item -Path $FfmpegBin -Destination (Join-Path $stage 'ffmpeg') -Recurse -Force
    }
    $zip = Join-Path $Dist "FlowPost-$Version-portable.zip"
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path $stage -DestinationPath $zip
    (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower() | Set-Content "$zip.sha256" -Encoding ascii
    "    -> $zip"
  }

  if ($Target -in 'all', 'installer') {
    '==> setup .exe (Inno Setup)'
    $iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
    if (-not (Test-Path $iscc)) {
      throw "Inno Setup not found at '$iscc'. Install it: choco install innosetup --yes"
    }
    & $iscc "/DMyAppVersion=$Version" (Join-Path $App 'installer\flowpost.iss')
    if ($LASTEXITCODE -ne 0) { throw "ISCC.exe failed with exit code $LASTEXITCODE" }
    $setup = Join-Path $Dist 'FlowPostNativeSetup.exe'
    if (-not (Test-Path $setup)) { throw "Installer was not produced: $setup" }
    (Get-FileHash -Algorithm SHA256 $setup).Hash.ToLower() | Set-Content "$setup.sha256" -Encoding ascii
    "    -> $setup"
  }

  ''
  "Done. Artifacts are in $Dist (gitignored)."
}
finally {
  Pop-Location
}

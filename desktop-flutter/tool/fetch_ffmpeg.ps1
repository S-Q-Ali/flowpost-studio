<#
.SYNOPSIS
  Downloads the pinned BtbN FFmpeg LGPL shared build and extracts the files the
  app ships (ADR 0002).

.DESCRIPTION
  The zip is cached under third_party/cache/ so a rebuild stays reproducible
  after upstream rotates its "latest" release. The SHA-256 is verified before
  anything is extracted; a mismatch aborts.

  Usage:
    powershell -ExecutionPolicy Bypass -File tool\fetch_ffmpeg.ps1
    powershell -ExecutionPolicy Bypass -File tool\fetch_ffmpeg.ps1 -Force
#>
[CmdletBinding()]
param(
  # Re-download even when the cached zip is present.
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$Url = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-28-19-47/ffmpeg-n8.1.3-25-g611cec792a-win64-lgpl-shared-8.1.zip'
$Sha256 = '0448C3F3B9BDC724CC0189D5CE6E6BFA5B8937E7EC408E1E97FB08719BDB3B92'
$ArchiveName = 'ffmpeg-n8.1.3-25-g611cec792a-win64-lgpl-shared-8.1.zip'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$CacheDir = Join-Path $RepoRoot 'third_party\cache'
$TargetDir = Join-Path $RepoRoot 'third_party\ffmpeg\bin'

$Archive = Join-Path $CacheDir $ArchiveName

function Get-ArchiveHash($path) {
  return (Get-FileHash -Path $path -Algorithm SHA256).Hash.ToUpperInvariant()
}

if ($Force -and (Test-Path $Archive)) {
  Remove-Item $Archive -Force
}

if (-not (Test-Path $Archive)) {
  New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
  Write-Host "Downloading $Url"
  # curl.exe writes binary safely; Invoke-WebRequest mangles large payloads on
  # some PowerShell versions.
  & curl.exe -L --fail --silent --show-error -o $Archive $Url
  if ($LASTEXITCODE -ne 0) { throw "Download failed with exit code $LASTEXITCODE" }
} else {
  Write-Host "Using cached $Archive"
}

$hash = Get-ArchiveHash $Archive
if ($hash -ne $Sha256) {
  throw "SHA-256 mismatch for $Archive`n  expected $Sha256`n  actual   $hash`nDelete the cached file and retry once upstream has settled."
}
Write-Host "SHA-256 verified: $hash"

if (Test-Path $TargetDir) { Remove-Item $TargetDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

$extractRoot = Join-Path $CacheDir 'extract'
if (Test-Path $extractRoot) { Remove-Item $extractRoot -Recurse -Force }
Expand-Archive -Path $Archive -DestinationPath $extractRoot -Force

# The build ships one top-level folder; find the bin directory inside it.
$binDir = Get-ChildItem -Path $extractRoot -Directory -Recurse |
  Where-Object { $_.Name -eq 'bin' } |
  Select-Object -First 1
if (-not $binDir) { throw 'bin directory not found in the archive' }

# Ship only what runs: the two executables we call plus the DLLs they load.
# ffplay.exe is a player we never use.
Get-ChildItem -Path $binDir.FullName -Filter '*.dll' | Copy-Item -Destination $TargetDir -Force
foreach ($exe in @('ffmpeg.exe', 'ffprobe.exe')) {
  $source = Join-Path $binDir.FullName $exe
  if (-not (Test-Path $source)) { throw "$exe missing from the archive" }
  Copy-Item $source -Destination $TargetDir -Force
}

$license = Get-ChildItem -Path $extractRoot -Filter 'LICENSE.txt' -Recurse |
  Select-Object -First 1
if ($license) { Copy-Item $license.FullName -Destination $TargetDir -Force }

Remove-Item $extractRoot -Recurse -Force

$version = & (Join-Path $TargetDir 'ffmpeg.exe') -hide_banner -version 2>&1 | Out-String
Write-Host ($version -split "`n" | Select-Object -First 1)

# A build that fails the license check must not stay on disk, or a later
# packaging step could ship it.
function Assert-BuildLicense($ok, $message) {
  if ($ok) { return }
  if (Test-Path $TargetDir) { Remove-Item $TargetDir -Recurse -Force }
  throw $message
}

Assert-BuildLicense ($version -notmatch '--enable-gpl') 'The build is GPL; it cannot be shipped.'
Assert-BuildLicense ($version -match '--enable-version3') 'The build is not the expected LGPL v3 build.'
Assert-BuildLicense ($version -match '--enable-shared') 'The build is not the shared build ADR 0002 pins.'
Assert-BuildLicense ($version -match '--disable-libx264') 'The build ships libx264; it cannot be shipped.'

$size = (Get-ChildItem $TargetDir -File | Measure-Object -Property Length -Sum).Sum
Write-Host ("Ready: {0} files, {1:N1} MB in {2}" -f (Get-ChildItem $TargetDir -File).Count, ($size / 1MB), $TargetDir)

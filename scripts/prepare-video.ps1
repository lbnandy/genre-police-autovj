param([string]$DestinationDirectory = '')
$ErrorActionPreference = 'Stop'
$videoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $DestinationDirectory) { $DestinationDirectory = Join-Path $videoRoot 'native/bin' }
$videoDestination = [IO.Path]::GetFullPath($DestinationDirectory)
if (-not $videoDestination.StartsWith($videoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Video build output must be inside the AutoVJ project' }
$videoDll = Join-Path $videoDestination 'Processing.NDI.Lib.x64.dll'
$videoDllHash = '2b6602075868ba4401f82f417d72424805d69b11ca86078023d0d489ff45dd84'
function Test-VideoHash([string]$File, [string]$Hash) {
  if (-not [IO.File]::Exists($File)) { return $false }
  $videoHashStream = [IO.File]::OpenRead($File)
  $videoHasher = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($videoHasher.ComputeHash($videoHashStream)).Replace('-','') -eq $Hash) }
  finally { $videoHashStream.Dispose(); $videoHasher.Dispose() }
}
if (Test-VideoHash $videoDll $videoDllHash) { Write-Output 'NDI 6.3.2 runtime verified.'; return }
$videoCache = Join-Path $videoRoot '.upstream-staging'
New-Item -ItemType Directory -Force -Path $videoCache,$videoDestination | Out-Null
function Get-VideoDependency([string]$Url, [string]$File, [string]$Hash) {
  if (-not (Test-VideoHash $File $Hash)) { Invoke-WebRequest -Uri $Url -OutFile $File -UseBasicParsing }
  if (-not (Test-VideoHash $File $Hash)) { throw "Dependency checksum changed: $Url. Review the new SDK/license and update the pin before building." }
}
$videoSdk = Join-Path $videoCache 'NDI-6-SDK.exe'
$videoExtractorZip = Join-Path $videoCache 'innoextract.zip'
Get-VideoDependency 'https://downloads.ndi.tv/SDK/NDI_SDK/NDI%206%20SDK.exe' $videoSdk '4d5dd36a1c7c7634f408bf459b068787cce6f5310a3efe832d76b1ddeB54e499'
Get-VideoDependency 'https://github.com/dscharrer/innoextract/releases/download/1.9/innoextract-1.9-windows.zip' $videoExtractorZip '6989342c9b026a00a72a38f23b62a8e6a22cc5de69805cf47d68ac2fec993065'
$videoExtractorDir = Join-Path $videoCache 'innoextract'
New-Item -ItemType Directory -Force -Path $videoExtractorDir | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$videoZip = [IO.Compression.ZipFile]::OpenRead($videoExtractorZip)
try {
  $videoEntry = $videoZip.GetEntry('innoextract.exe')
  if (-not $videoEntry) { throw 'The pinned extractor archive has no expected executable' }
  [IO.Compression.ZipFileExtensions]::ExtractToFile($videoEntry,(Join-Path $videoExtractorDir 'innoextract.exe'),$true)
} finally { $videoZip.Dispose() }
$videoExtracted = Join-Path $videoCache 'ndi-runtime-extracted'
& (Join-Path $videoExtractorDir 'innoextract.exe') --silent --extract --include 'Processing.NDI.Lib.x64.dll' --output-dir $videoExtracted $videoSdk
if ($LASTEXITCODE -ne 0) { throw 'Could not extract the app-local NDI runtime' }
$videoSource = Join-Path $videoExtracted 'app/Bin/x64/Processing.NDI.Lib.x64.dll'
if (-not (Test-VideoHash $videoSource $videoDllHash)) { throw 'Extracted NDI runtime checksum mismatch' }
Copy-Item -LiteralPath $videoSource -Destination $videoDll -Force
Write-Output 'Prepared app-local NDI 6.3.2 runtime. No system installation or NDI Tools distribution.'

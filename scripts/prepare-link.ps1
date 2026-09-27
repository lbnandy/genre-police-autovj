$ErrorActionPreference = 'Stop'
$linkRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$linkVendor = Join-Path $linkRoot 'vendor/carabiner'
$linkManifest = Get-Content -LiteralPath (Join-Path $linkVendor 'component.json') -Raw | ConvertFrom-Json
& node (Join-Path $PSScriptRoot 'link-build-info.cjs') check
if ($LASTEXITCODE -eq 0) { Write-Output 'Patched Carabiner runtime and build inputs verified.'; return }
& node (Join-Path $PSScriptRoot 'link-build-info.cjs') inputs
if ($LASTEXITCODE -ne 0) { throw 'Link source or patch verification failed.' }
$linkStage = Join-Path $linkRoot ('.upstream-staging/link-build-' + $linkManifest.patchSha256.Substring(0,12))
$linkSource = Join-Path $linkStage 'carabiner-1.2.0'
if (-not (Test-Path -LiteralPath (Join-Path $linkStage 'patched-verified'))) {
  Expand-Archive -LiteralPath (Join-Path $linkVendor $linkManifest.sourceFile) -DestinationPath $linkStage -Force
  & git -C (Join-Path $linkSource 'link') init --quiet
  if ($LASTEXITCODE -ne 0) { throw 'Cannot initialize isolated patch workspace.' }
  & git -C (Join-Path $linkSource 'link') apply --check (Join-Path $linkVendor $linkManifest.patchFile)
  if ($LASTEXITCODE -ne 0) { throw 'Link patch does not match pinned source.' }
  & git -C (Join-Path $linkSource 'link') apply (Join-Path $linkVendor $linkManifest.patchFile)
  if ($LASTEXITCODE -ne 0) { throw 'Link patch failed.' }
  Set-Content -LiteralPath (Join-Path $linkStage 'patched-verified') -Value $linkManifest.patchSha256
}
$linkVs = & 'C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe' -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $linkVs) { throw 'Visual Studio C++ build tools are required to build the bundled Link component.' }
$linkCmake = Join-Path $linkVs 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
$linkBuild = Join-Path $linkStage 'build'
& $linkCmake -S $linkSource -B $linkBuild -G 'Visual Studio 17 2022' -A x64
if ($LASTEXITCODE -ne 0) { throw 'Carabiner configuration failed.' }
& $linkCmake --build $linkBuild --config Release --parallel 4
if ($LASTEXITCODE -ne 0) { throw 'Carabiner build failed.' }
New-Item -ItemType Directory -Force -Path (Join-Path $linkRoot 'native/bin') | Out-Null
Copy-Item -LiteralPath (Join-Path $linkBuild 'bin/Release/Carabiner.exe') -Destination (Join-Path $linkRoot 'native/bin/Carabiner.exe') -Force
& node (Join-Path $PSScriptRoot 'link-build-info.cjs') write
if ($LASTEXITCODE -ne 0) { throw 'Link build verification failed.' }
Write-Output 'Prepared Carabiner 1.2.0 with the AutoVJ UDP receive recovery patch.'

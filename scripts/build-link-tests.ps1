$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
& (Join-Path $PSScriptRoot 'prepare-link.ps1')
$m=Get-Content (Join-Path $root 'vendor/carabiner/component.json') -Raw | ConvertFrom-Json
$source=Join-Path $root ('.upstream-staging/link-build-'+$m.patchSha256.Substring(0,12)+'/carabiner-1.2.0/link')
$vs=& 'C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe' -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$cmake=Join-Path $vs 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
& $cmake -S (Join-Path $root 'native/tests') -B (Join-Path $root '.qa/link-peer-build') -G 'Visual Studio 17 2022' -A x64 "-DLINK_SOURCE_DIR=$source"
if($LASTEXITCODE -ne 0){throw 'Link test configuration failed'}
& $cmake --build (Join-Path $root '.qa/link-peer-build') --config Release --parallel 4
if($LASTEXITCODE -ne 0){throw 'Link test build failed'}

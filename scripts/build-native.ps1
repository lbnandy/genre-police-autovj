$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
& (Join-Path $PSScriptRoot 'prepare-video.ps1')
& (Join-Path $PSScriptRoot 'prepare-link.ps1')
& node (Join-Path $PSScriptRoot 'prepare-native.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Native adapter preparation failed' }
$taskVswhere = 'C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe'
$taskVs = & $taskVswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $taskVs) { throw 'Visual Studio 2022 C++ tools are required' }
$taskCmake = Join-Path $taskVs 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
& $taskCmake -S (Join-Path $taskRoot 'native') -B (Join-Path $taskRoot 'native/build') -G 'Visual Studio 17 2022' -A x64
if ($LASTEXITCODE -ne 0) { throw 'CMake configuration failed' }
& $taskCmake --build (Join-Path $taskRoot 'native/build') --config Release --parallel 4
if ($LASTEXITCODE -ne 0) { throw 'Native compilation failed' }

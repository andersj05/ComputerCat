param([string]$CMake = 'cmake', [string]$Generator = '', [string]$WhisperSource = '', [string]$JsonSource = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$build = Join-Path $root '.local/whisper/helper-build'
$stage = Join-Path $root 'resources/voice/bin'
if (-not (Get-Command $CMake -ErrorAction SilentlyContinue)) {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
  if (Test-Path $vswhere) {
    $vs = & $vswhere -latest -products '*' -property installationPath
    $CMake = Join-Path $vs 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
  }
}
$arguments = @('-S', (Join-Path $root 'native/whisper-helper'), '-B', $build, '-A', 'x64')
if ($Generator) { $arguments += @('-G', $Generator) }
if ($WhisperSource) { $arguments += "-DFETCHCONTENT_SOURCE_DIR_WHISPER=$WhisperSource" }
if ($JsonSource) { $arguments += "-DFETCHCONTENT_SOURCE_DIR_JSON=$JsonSource" }
& $CMake @arguments
if ($LASTEXITCODE -ne 0) { throw 'Native configure failed' }
& $CMake --build $build --config Release --parallel 6
if ($LASTEXITCODE -ne 0) { throw 'Native build failed' }
& $CMake --install $build --config Release --prefix $stage --component helper
if ($LASTEXITCODE -ne 0) { throw 'Native staging failed' }


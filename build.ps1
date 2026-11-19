# Examples: .\build.ps1 desktop --install-deps; .\build.ps1 vscode
$ErrorActionPreference = 'Stop'
$buildPython = if ($env:PYTHON) { $env:PYTHON } else { 'python' }
& $buildPython (Join-Path $PSScriptRoot 'build.py') @args
exit $LASTEXITCODE

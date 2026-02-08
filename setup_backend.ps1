$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Venv = Join-Path $Root ".venv"
$Python = Join-Path $Venv "Scripts\\python.exe"

if (!(Test-Path $Venv)) {
  python -m venv $Venv
}

& $Python -m pip install --upgrade pip
& $Python -m pip install -r "$Root\\python_api\\requirements.txt"
& $Python -m pip install -e "$Root\\VieNeu-TTS-Fast-Vietnamese"
& $Python -m pip install -e "$Root\\F5-TTS-Vietnamese"

Write-Host "Backend venv ready."
Write-Host "Start with: $Python -m python_api.main"

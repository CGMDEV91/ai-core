# install.ps1 — install / update ai-core in a project (Windows; Linux/WSL/macOS: install.sh).
#   & ~\devel\ai-core\install.ps1 <project-dir> [--update | --reconfigure | --status | --promote … | --uninstall] [--yes …]
# Everything else: install.ps1 --help  (logic: install.ts, Node >= 22.6, no npm packages; git for Windows for the hooks)
# Before it runs: Node >= 22.6 and git. When one is missing it says so, asks, and installs it with winget.
# --install-deps installs without asking. The stack's tools (docker, java…) are checked by the installer ("Tools" step).
# A project that lives in WSL (\\wsl.localhost\...) is better installed from WSL: ~/devel/ai-core/install.sh
$ErrorActionPreference = 'Stop'
$auto = $args -contains '--install-deps'

function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Need($tool, $why, $id) {
  Write-Host "x $tool is needed - $why" -ForegroundColor Yellow
  $cmd = "winget install --id $id -e --source winget --accept-package-agreements --accept-source-agreements"
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Write-Host "  winget is not available: install $tool by hand and run this again"; exit 1 }
  $go = $auto
  if (-not $go) { $r = Read-Host "  ? Install $tool now? (runs: $cmd) [y/N]"; $go = $r -match '^(y|yes|s|si|sí)$' }
  if (-not $go) { Write-Host "  run it yourself and then this again:`n    $cmd"; exit 1 }
  & winget install --id $id -e --source winget --accept-package-agreements --accept-source-agreements
  Refresh-Path
}

$nodeOk = { $n = Get-Command node -ErrorAction SilentlyContinue; if (-not $n) { return $false }
  $v = (& node -p 'process.versions.node').Split('.'); return ([int]$v[0] -gt 22 -or ([int]$v[0] -eq 22 -and [int]$v[1] -ge 6)) }
if (-not (& $nodeOk)) {
  $have = if (Get-Command node -ErrorAction SilentlyContinue) { & node --version } else { 'not installed' }
  Need 'node' "ai-core runs on Node >= 22.6 (TypeScript without a build step); here: $have" 'OpenJS.NodeJS.LTS'
  if (-not (& $nodeOk)) { Write-Host 'x Node is still not found - open a new terminal and run this again' -ForegroundColor Yellow; exit 1 }
  Write-Host "ok node $(& node --version)" -ForegroundColor Green
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Need 'git' 'the hooks, the exclude list and the .ai repository use it' 'Git.Git'
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Host 'x git is still not found - open a new terminal and run this again' -ForegroundColor Yellow; exit 1 }
  Write-Host "ok $(& git --version)" -ForegroundColor Green
}
& node --experimental-strip-types --no-warnings (Join-Path $PSScriptRoot 'install.ts') @args
exit $LASTEXITCODE

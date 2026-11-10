# install.ps1 — install / update ai-core in a project (Windows; Linux/WSL/macOS: install.sh).
#   & ~\devel\ai-core\install.ps1 <project-dir> [--update | --reconfigure | --status | --promote … | --uninstall] [--yes …]
# Everything else: install.ps1 --help  (logic: install.ts, Node >= 22.6, no dependencies; git for Windows for the hooks)
$ErrorActionPreference = 'Stop'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Write-Error 'Node >= 22.6 is required - https://nodejs.org'; exit 1 }
$v = (& node -p 'process.versions.node').Split('.')
if ([int]$v[0] -lt 22 -or ([int]$v[0] -eq 22 -and [int]$v[1] -lt 6)) { Write-Error "Node $(& node --version) is too old - >= 22.6 runs TypeScript natively"; exit 1 }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Warning 'git not found: the git hooks and the exclude list will be skipped' }
& node --experimental-strip-types --no-warnings (Join-Path $PSScriptRoot 'install.ts') @args
exit $LASTEXITCODE

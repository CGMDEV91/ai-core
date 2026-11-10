#!/usr/bin/env bash
# install.sh — install / update ai-core in a project (Linux, WSL, macOS). Windows: install.ps1.
#   ~/devel/ai-core/install.sh <project-dir> [--update | --reconfigure | --status | --promote … | --uninstall] [--yes …]
# Everything else: ~/devel/ai-core/install.sh --help  (logic: install.ts, Node ≥ 22.6, no npm packages)
# Before it runs: Node ≥ 22.6 and git. When one is missing it says so, asks, and installs it (Node with nvm, in your
# home, no sudo; git with apt / dnf / brew). --install-deps installs without asking. The tools of the stack (ddev,
# docker, php, java…) are checked by the installer itself, in its "Tools" step.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO=0; for x in "$@"; do [ "$x" = "--install-deps" ] && AUTO=1; done
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then B=$'\e[1m'; Y=$'\e[33m'; G=$'\e[32m'; D=$'\e[2m'; N=$'\e[0m'; else B= Y= G= D= N=; fi

# yes/no question on the terminal (works even when stdin is a pipe); --install-deps answers yes; no terminal → no
confirm() {
  [ "$AUTO" = 1 ] && return 0
  { : < /dev/tty; } 2>/dev/null || return 1
  local r; printf '  %s?%s %s [y/N]: ' "$Y" "$N" "$1" > /dev/tty; read -r r < /dev/tty 2>/dev/null || return 1
  [[ "$r" =~ ^([yY]|[yY][eE][sS]|[sS]|[sS][iIíÍ])$ ]]
}
need() {   # need <tool> <why> <install command>
  echo "${Y}✖${N} ${B}$1${N} is needed — $2"
  if [ -z "$3" ]; then echo "  install it by hand and run this again"; exit 1; fi
  if confirm "Install $1 now? ${D}(runs: $3)${N}"; then
    echo "  ${D}\$ $3${N}"; bash -c "$3" || { echo "${Y}✖${N} the install of $1 failed — install it by hand and run this again" >&2; exit 1; }
  else
    echo "  run it yourself and then this again:"; echo "    $3"; exit 1
  fi
}
pm_install() {   # the command that installs a system package here, or empty
  if command -v apt-get >/dev/null 2>&1; then echo "sudo apt-get update && sudo apt-get install -y $1"
  elif command -v dnf >/dev/null 2>&1; then echo "sudo dnf install -y $1"
  elif command -v brew >/dev/null 2>&1; then echo "brew install $1"
  fi
}

# Node: nvm may be installed but not loaded (non-interactive shell)
[ -s "$HOME/.nvm/nvm.sh" ] && ! command -v node >/dev/null 2>&1 && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
node_ok() { command -v node >/dev/null 2>&1 && node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=6)?0:1)'; }
if ! node_ok; then
  have=$(command -v node >/dev/null 2>&1 && node --version || echo "not installed")
  need node "ai-core runs on Node ≥ 22.6 (TypeScript without a build step); here: $have" \
    'curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && . "$HOME/.nvm/nvm.sh" && nvm install 22 && nvm alias default 22'
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
  nvm use 22 >/dev/null 2>&1 || true
  node_ok || { echo "${Y}✖${N} Node is still not found here — open a new terminal and run this again" >&2; exit 1; }
  echo "${G}✔${N} node $(node --version)"
fi
if ! command -v git >/dev/null 2>&1; then
  need git "the hooks, the exclude list and the .ai repository use it" "$(pm_install git)"
  command -v git >/dev/null 2>&1 || { echo "${Y}✖${N} git is still not found" >&2; exit 1; }
  echo "${G}✔${N} $(git --version)"
fi
exec node --experimental-strip-types --no-warnings "$HERE/install.ts" "$@"

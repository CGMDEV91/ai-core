#!/usr/bin/env bash
# install-commands.sh — once per machine: adds the commands install-ai-framework and update-ai-framework to your shells.
#   WSL / Linux / macOS: a block in ~/.bashrc (and ~/.zshrc when it exists)
#   Windows (from WSL):  a block in your PowerShell profile — the commands run inside WSL, where git, ddev and node are
# Run it again after moving the ai-core repository. --remove takes the blocks out.
set -euo pipefail
FRAMEWORK="$(cd "$(dirname "$0")/.." && pwd -P)"
BEGIN="# >>> ai-framework >>>"; END="# <<< ai-framework <<<"
OLD_BEGIN="# >>> ai-framework (generic-guidelines) >>>"; OLD_END="# <<< ai-framework (generic-guidelines) <<<"   # an earlier set-up
REMOVE=false; [ "${1:-}" = "--remove" ] && REMOVE=true
say() { printf '%s\n' "$*"; }

put_block() {   # put_block <file> <content>: replace the block between the markers (or add it at the end)
    local f="$1" body="$2" tmp
    mkdir -p "$(dirname "$f")"; touch "$f"
    tmp="$(mktemp)"
    awk -v b="$BEGIN" -v e="$END" -v ob="$OLD_BEGIN" -v oe="$OLD_END" '$0==b||$0==ob{skip=1;next} $0==e||$0==oe{skip=0;next} !skip' "$f" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' > "$tmp"
    if ! $REMOVE; then printf '\n%s\n%s\n%s\n' "$BEGIN" "$body" "$END" >> "$tmp"; fi
    cat "$tmp" > "$f"; rm -f "$tmp"
}

BASH_BODY="export AI_FRAMEWORK_HOME=\"$FRAMEWORK\"
install-ai-framework() { bash \"\$AI_FRAMEWORK_HOME/bin/install-ai-framework.sh\" \"\$@\"; }
update-ai-framework()  { bash \"\$AI_FRAMEWORK_HOME/bin/update-ai-framework.sh\" \"\$@\"; }"
for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
    [ "$rc" = "$HOME/.zshrc" ] && [ ! -f "$rc" ] && continue
    put_block "$rc" "$BASH_BODY"
    if $REMOVE; then say "✔ removed from $rc"; else say "✔ $rc: install-ai-framework, update-ai-framework"; fi
done

# Windows: the PowerShell profile of this user (when this is WSL and powershell.exe answers)
if [ -n "${WSL_DISTRO_NAME:-}" ] && command -v powershell.exe >/dev/null 2>&1; then
    WINPROFILE="$(cd /tmp && powershell.exe -NoProfile -Command '$PROFILE.CurrentUserAllHosts' 2>/dev/null | tr -d '\r')"
    if [ -n "$WINPROFILE" ]; then
        LPROFILE="$(wslpath -u "$WINPROFILE")"
        PS_BODY="$(cat <<'PSEOF'
$env:AI_FRAMEWORK_WSL = '__DISTRO__|__FRAMEWORK__'
function Invoke-AiFramework([string]$Script, [string[]]$Rest) {
    $distro, $framework = $env:AI_FRAMEWORK_WSL -split '\|', 2
    $here = (Get-Location).ProviderPath
    if ($here -match '^\\\\wsl(?:\.localhost|\$)\\([^\\]+)\\(.*)$') { $distro = $Matches[1]; $path = '/' + ($Matches[2] -replace '\\', '/') }
    elseif ($here -match '^([A-Za-z]):\\?(.*)$') { $path = '/mnt/' + $Matches[1].ToLower() + '/' + ($Matches[2] -replace '\\', '/') }
    else { Write-Host "Not a folder WSL can reach: $here"; return }
    $quoted = ($Rest | ForEach-Object { "'" + ($_ -replace "'", "'\''") + "'" }) -join ' '
    wsl.exe -d $distro --cd $path -- bash -lc "bash '$framework/bin/$Script' $quoted"
}
function install-ai-framework { Invoke-AiFramework 'install-ai-framework.sh' $args }
function update-ai-framework  { Invoke-AiFramework 'update-ai-framework.sh' $args }
PSEOF
)"
        PS_BODY="${PS_BODY//__DISTRO__/$WSL_DISTRO_NAME}"; PS_BODY="${PS_BODY//__FRAMEWORK__/$FRAMEWORK}"
        put_block "$LPROFILE" "$PS_BODY"
        if $REMOVE; then say "✔ removed from $WINPROFILE"
        else
            say "✔ PowerShell ($WINPROFILE): install-ai-framework, update-ai-framework (they run in WSL $WSL_DISTRO_NAME)"
            pol="$(cd /tmp && powershell.exe -NoProfile -Command 'Get-ExecutionPolicy' 2>/dev/null | tr -d '\r')"
            case "$pol" in Restricted|AllSigned) say "  ⚠ PowerShell's execution policy is $pol: the profile does not load. Ask for RemoteSigned, or: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned" ;; esac
        fi
    fi
fi
$REMOVE || { say ""; say "Open a new terminal (or: source ~/.bashrc), go to a project folder and run: install-ai-framework"; }

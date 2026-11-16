<#
.SYNOPSIS
    Installs the methodology's opencode wiring (commands, agents, instructions, optionally the
    permission baseline) into the user-global opencode config. Run ONCE per developer machine;
    it serves every workspace on it.

.DESCRIPTION
    The knowledge repository is cloned INSIDE the workspace folder as `.ai/`, and the workspace
    folder itself is not a git repository: nothing can be versioned at its root, so the wiring is
    installed per machine. This script only touches the user-global opencode config directory
    (default ~/.config/opencode, or $env:XDG_CONFIG_HOME/opencode):

      commands/<15 commands>.md  thin stubs that point at .ai/commands/<name>.md of the folder
                                 opencode is launched in
      agents/<5 agents>.md       reviewer, security, tester, executor, architect
      plugin/ai-methodology.ts   loads .ai/scripts/opencode/plugin/ of the folder opencode is
                                 launched in: the ticket header on every message, the ticket kept
                                 after compaction, edits recorded in the ticket (nothing elsewhere)
      opencode.json              "instructions" entries .ai/... are ADDED (never replaced); with
                                 -WithPermissions the permission baseline is added when the file
                                 has none; a timestamped backup is made before any change
      .ai-methodology.json       manifest of what this script installed (used to update and to
                                 uninstall safely)

    It never overwrites a file it did not install (a same-named file of yours is skipped and
    reported), and it never touches the machine-wide policy (C:\ProgramData\opencode).
    Idempotent: re-run it after a pull that changed .ai/install/ (the copies do not update
    themselves).

.PARAMETER ConfigDir
    Override the target config directory (for testing).

.PARAMETER WithPermissions
    Also add the methodology's permission baseline to the user opencode.json - only when that file
    has no "permission" key. It then applies to EVERY project of this user.

.PARAMETER Uninstall
    Remove exactly what the manifest says was installed: the files, the .ai/ instructions entries,
    and the permission block if this script added it.

.EXAMPLE
    powershell -File .ai\install\install-opencode.ps1
    powershell -File .ai\install\install-opencode.ps1 -WithPermissions
    powershell -File .ai\install\install-opencode.ps1 -Uninstall
#>
param(
    [string]$ConfigDir,
    [switch]$WithPermissions,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$Instructions = @('.ai/non-negotiables.md', '.ai/orchestrator.md', '.ai/rules/*.md')
$Legacy       = @('.ai/operating-card.md')   # instructions of older versions, removed on install
$Source       = Join-Path $PSScriptRoot 'opencode'
$Version      = (Get-Content -Raw (Join-Path $PSScriptRoot 'VERSION')).Trim()

if (-not $ConfigDir) {
    if ($env:XDG_CONFIG_HOME) { $ConfigDir = Join-Path $env:XDG_CONFIG_HOME 'opencode' }
    else                      { $ConfigDir = Join-Path $HOME '.config\opencode' }
}
$ManifestPath = Join-Path $ConfigDir '.ai-methodology.json'
$JsonPath     = Join-Path $ConfigDir 'opencode.json'
$JsoncPath    = Join-Path $ConfigDir 'opencode.jsonc'

function Write-Utf8NoBom([string]$Path, [string]$Text) {
    [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false)))
}

function Read-Manifest {
    if (Test-Path $ManifestPath) { return Get-Content -Raw $ManifestPath | ConvertFrom-Json }
    return $null
}

function Show-ManualMerge([string]$Reason) {
    Write-Warning "$Reason"
    $verb = if ($Uninstall) { 'Remove these entries from' } else { 'Add these entries to' }
    Write-Host   "  $verb the ""instructions"" array of your global opencode config by hand:"
    $Instructions | ForEach-Object { Write-Host "    ""$_""," }
}

# Loads opencode.json as an object, or returns $null (and explains) when it cannot be edited safely.
function Read-GlobalJson {
    if (Test-Path $JsoncPath) {
        Show-ManualMerge "Found $JsoncPath (JSONC). Not editing it automatically."
        return $null
    }
    if (-not (Test-Path $JsonPath)) { return $null }
    try   { return Get-Content -Raw $JsonPath | ConvertFrom-Json }
    catch {
        Show-ManualMerge "$JsonPath is not plain JSON (comments?). Not editing it automatically."
        return $null
    }
}

function Save-GlobalJson($Config) {
    $backup = "$JsonPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item $JsonPath $backup
    Write-Utf8NoBom $JsonPath ($Config | ConvertTo-Json -Depth 32)
    Write-Host "  backup of the previous file: $backup"
}

# ---------------------------------------------------------------------------------------------
if ($Uninstall) {
    $manifest = Read-Manifest
    if (-not $manifest) { Write-Host "Nothing to uninstall: no manifest at $ManifestPath"; exit 0 }

    foreach ($rel in $manifest.files) {
        $target = Join-Path $ConfigDir $rel
        if (Test-Path $target) { Remove-Item $target; Write-Host "  removed  $rel" }
    }
    $config = Read-GlobalJson
    if ($config) {
        $changed = $false
        if ($config.PSObject.Properties.Name -contains 'instructions') {
            $kept = @($config.instructions | Where-Object { $Instructions -notcontains $_ })
            if ($kept.Count -ne @($config.instructions).Count) {
                if ($kept.Count -eq 0) { $config.PSObject.Properties.Remove('instructions') }
                else                   { $config.instructions = $kept }
                $changed = $true
                Write-Host "  removed the .ai/ entries from ""instructions"" in $JsonPath"
            }
        }
        if ($manifest.PSObject.Properties.Name -contains 'permissionsAdded' -and $manifest.permissionsAdded -and
            ($config.PSObject.Properties.Name -contains 'permission')) {
            $config.PSObject.Properties.Remove('permission')
            $changed = $true
            Write-Host "  removed the ""permission"" block this script had added to $JsonPath"
        }
        if ($changed) { Save-GlobalJson $config }
    }
    Remove-Item $ManifestPath
    Write-Host "Uninstalled methodology wiring $($manifest.version) from $ConfigDir"
    exit 0
}

# ---------------------------------------------------------------------------------------------
Write-Host "Installing methodology wiring $Version into $ConfigDir"
foreach ($dir in @($ConfigDir, (Join-Path $ConfigDir 'commands'), (Join-Path $ConfigDir 'agents'), (Join-Path $ConfigDir 'plugin'))) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
}

$manifest  = Read-Manifest
$owned     = @(); if ($manifest) { $owned = @($manifest.files) }
$permissionsAdded = $false
if ($manifest -and ($manifest.PSObject.Properties.Name -contains 'permissionsAdded')) { $permissionsAdded = [bool]$manifest.permissionsAdded }
$installed = @()
$skipped   = @()

foreach ($kind in @('commands', 'agents', 'plugin')) {
    if (-not (Test-Path (Join-Path $Source $kind))) { continue }
    foreach ($file in Get-ChildItem (Join-Path $Source $kind) -File | Where-Object { $_.Extension -in '.md', '.ts' }) {
        $rel    = "$kind/$($file.Name)"
        $target = Join-Path $ConfigDir $rel
        $exists = Test-Path $target
        if ($exists -and ($owned -notcontains $rel) -and
            ((Get-FileHash $target).Hash -ne (Get-FileHash $file.FullName).Hash)) {
            $skipped += $rel
            continue
        }
        Copy-Item $file.FullName $target -Force
        $installed += $rel
    }
}

# files this script installed earlier that the new version no longer ships (e.g. a retired command)
$retired = @()
foreach ($rel in $owned) {
    if ($installed -contains $rel) { continue }
    if (Test-Path (Join-Path $Source $rel)) { continue }
    $target = Join-Path $ConfigDir $rel
    if (Test-Path $target) { Remove-Item $target; $retired += $rel }
}

# instructions (and optionally permissions): add what is missing, never replace the user's file
$instructionsStatus = ''
$permissionsStatus  = 'not requested (use -WithPermissions)'
$global = Get-Content -Raw (Join-Path $Source 'opencode.global.json') | ConvertFrom-Json
if ((-not (Test-Path $JsonPath)) -and (-not (Test-Path $JsoncPath))) {
    if ($WithPermissions) {
        Copy-Item (Join-Path $Source 'opencode.global.json') $JsonPath
        $permissionsAdded = $true
        $permissionsStatus = "added (new file)"
    } else {
        $global.PSObject.Properties.Remove('permission')
        Write-Utf8NoBom $JsonPath ($global | ConvertTo-Json -Depth 32)
    }
    $instructionsStatus = "created $JsonPath with the .ai/ instructions"
} else {
    $config = Read-GlobalJson
    if ($config) {
        $changed = $false
        $current = @()
        if ($config.PSObject.Properties.Name -contains 'instructions') { $current = @($config.instructions) }
        $legacyFound = @($current | Where-Object { $Legacy -contains $_ })
        if ($legacyFound.Count -gt 0) {
            $current = @($current | Where-Object { $Legacy -notcontains $_ })
            $config.instructions = $current
            $changed = $true
        }
        $missing = @($Instructions | Where-Object { $current -notcontains $_ })
        if ($missing.Count -gt 0) {
            $merged = @($current + $missing)
            if ($config.PSObject.Properties.Name -contains 'instructions') { $config.instructions = $merged }
            else { $config | Add-Member -NotePropertyName instructions -NotePropertyValue $merged }
            $changed = $true
            $instructionsStatus = "added $($missing.Count) entries to ""instructions"" in $JsonPath"
        } else {
            $instructionsStatus = "already present in $JsonPath"
        }
        if ($legacyFound.Count -gt 0) { $instructionsStatus += "; removed legacy entries: $($legacyFound -join ', ')" }
        if ($WithPermissions) {
            if ($config.PSObject.Properties.Name -contains 'permission') {
                $permissionsStatus = if ($permissionsAdded) { 'already added by this script' } else { 'NOT added: the file already has a "permission" block of yours' }
            } else {
                $config | Add-Member -NotePropertyName permission -NotePropertyValue $global.permission
                $permissionsAdded = $true
                $changed = $true
                $permissionsStatus = "added the baseline to $JsonPath (applies to every project of this user)"
            }
        }
        if ($changed) { Save-GlobalJson $config }
    } else {
        $instructionsStatus = 'NOT merged - see the warning above'
    }
}

$allOwned = @(($owned + $installed) | Sort-Object -Unique | Where-Object { Test-Path (Join-Path $ConfigDir $_) })
$manifestText = [ordered]@{ version = $Version; permissionsAdded = $permissionsAdded; files = $allOwned } | ConvertTo-Json -Depth 4
Write-Utf8NoBom $ManifestPath $manifestText

Write-Host ""
Write-Host "  files installed/updated : $($installed.Count)"
if ($retired.Count -gt 0) {
    Write-Host "  retired (no longer part of the methodology): $($retired -join ', ')"
}
Write-Host "  instructions            : $instructionsStatus"
Write-Host "  permissions             : $permissionsStatus"
if ($skipped.Count -gt 0) {
    Write-Warning "Skipped $($skipped.Count) file(s) that already exist and were not installed by this script:"
    $skipped | ForEach-Object { Write-Host "    $_" }
    Write-Host "  Rename or remove yours and re-run, or keep them knowingly (that command/agent will not be the methodology's)."
}
if ($env:AI_INIT) { exit 0 }   # called by install.ps1: it prints the summary and the next steps
Write-Host ""
Write-Host "Verify from a folder that has .ai/:  opencode debug config"
Write-Host "  expected: instructions include .ai/non-negotiables.md, .ai/orchestrator.md, .ai/rules/*.md;"
Write-Host "            15 commands (analysis bugfix gate update-ai-framework adaptive architect reviewer security tester learning start restart"
Write-Host "            impact touchpoints doctor); agents include reviewer security tester executor architect;"
Write-Host "            plugin ai-methodology (the ticket header on every message, kept after compaction)."
Write-Host "Re-run this script after a 'git -C .ai pull' that changed .ai/install/."

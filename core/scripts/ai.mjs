#!/usr/bin/env node
// ai.mjs — the short entry to the tools, the same on Linux, macOS, Windows and WSL (no bash needed):
//   node .ai/scripts/ai.mjs <command> [args…]      e.g.  node .ai/scripts/ai.mjs impact --key EUIPOFO-123
// Node ≥ 22.18 / 23.6 runs cli.ts as is; an older Node 22 re-runs it with --experimental-strip-types.
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

// opencode on Windows with the project in WSL (\\wsl.localhost\<distro>\…): Windows has no git, ddev or drush for it —
// run the same command inside WSL (its bash, its node through nvm). Only this entry crosses; AI_NO_WSL=1 turns it off.
const UNC = /^\\\\wsl(?:\.localhost|\$)\\([^\\]+)\\(.*)$/i
const self = fileURLToPath(import.meta.url).match(UNC)
if (process.platform === "win32" && self && !process.env.AI_NO_WSL) {
  const distro = self[1], script = "/" + self[2].replace(/\\/g, "/")
  const here = process.cwd().match(UNC)
  const cwd = here && here[1].toLowerCase() === distro.toLowerCase() ? "/" + here[2].replace(/\\/g, "/") : script.replace(/\/\.ai\/scripts\/ai\.mjs$/, "")
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`
  const nodeEnv = `[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; ` +
    `command -v node >/dev/null 2>&1 || export PATH="$HOME/.volta/bin:$HOME/.local/share/fnm/aliases/default/bin:$HOME/.local/bin:/usr/local/bin:$PATH"; `
  const pass = ["AI_SERVICE", "AI_ROOT", "AI_DEV", "SONAR_URL", "SONAR_TOKEN"].filter((k) => process.env[k]).map((k) => `${k}=${q(process.env[k])} `).join("")
  const cmd = `${nodeEnv}cd ${q(cwd)} && ${pass}node ${q(script)} ${process.argv.slice(2).map(q).join(" ")}`
  const r = spawnSync("wsl.exe", ["-d", distro, "--", "bash", "-lc", cmd], { stdio: "inherit" })
  if (r.error) { console.error(`ai.mjs: could not run the tools in WSL (${r.error.message}) — run them from a WSL terminal`); process.exit(2) }
  process.exit(r.status ?? 1)
}

const cli = join(dirname(fileURLToPath(import.meta.url)), "cli.ts")
const [maj, min] = process.versions.node.split(".").map(Number)
if (maj > 23 || (maj === 23 && min >= 6) || (maj === 22 && min >= 18)) {
  process.removeAllListeners("warning")   // no "Type Stripping is an experimental feature" line in the tools' output
  process.argv.splice(1, 1, cli)
  await import(pathToFileURL(cli).href)
} else {
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", cli, ...process.argv.slice(2)], { stdio: "inherit" })
  process.exit(r.status ?? 1)
}

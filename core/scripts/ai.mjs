#!/usr/bin/env node
// ai.mjs — the short entry to the tools, the same on Linux, macOS, Windows and WSL (no bash needed):
//   node .ai/scripts/ai.mjs <command> [args…]      e.g.  node .ai/scripts/ai.mjs impact --key EUIPOFO-123
// Node ≥ 22.18 / 23.6 runs cli.ts as is; an older Node 22 re-runs it with --experimental-strip-types.
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

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

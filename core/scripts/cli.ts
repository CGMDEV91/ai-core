// cli.ts — one entry point for the deterministic tools of ai-core (git hooks, CI, opencode tools, by hand):
//   node .ai/scripts/cli.ts <command> [args…]      e.g.  gate --skip-drush · apiindex --show entity_field_access
// Each command is .ai/scripts/lib/<command>.ts exporting main(argv): number | Promise<number>; the core and the stack
// install theirs in the same folder, so this file never changes when a stack adds one. Node ≥ 22.6, no npm.
import { existsSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const lib = join(dirname(fileURLToPath(import.meta.url)), "lib")
const [cmd, ...args] = process.argv.slice(2)
const commands = readdirSync(lib).filter((f) => f.endsWith(".ts") && !["util.ts", "project.ts", "claude.ts", "opencode.ts", "gatelib.ts"].includes(f) && !/^(gate|codeindex)-/.test(f)).map((f) => f.slice(0, -3))
if (!cmd || !commands.includes(cmd)) {
  console.error(`usage: node .ai/scripts/cli.ts <command> [args…]\ncommands: ${commands.sort().join(", ")}`)
  process.exit(cmd ? 2 : 0)
}
const mod = await import(pathToFileURL(join(lib, `${cmd}.ts`)).href)
if (typeof mod.main !== "function") { console.error(`${cmd}.ts has no main()`); process.exit(2) }
const code = await mod.main(args)
process.exitCode = typeof code === "number" ? code : 0

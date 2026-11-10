// where.ts — the `where` tool as a command (Claude Code, scripts): locate code in ONE call from the code index.
//   node .ai/scripts/cli.ts where <query> [--kind any|method|class|service|route|event|hook|field|string]
import { loadIndex, where } from "../opencode/tool/_lib.ts"
import { ROOT } from "./project.ts"

export function main(argv: string[]): number {
  const k = argv.indexOf("--kind"), kind = k >= 0 ? argv[k + 1] : "any"
  const query = argv.filter((_, i) => !(k >= 0 && (i === k || i === k + 1))).join(" ")
  if (!query) { console.error("usage: node .ai/scripts/cli.ts where <query> [--kind …]"); return 2 }
  console.log(where(loadIndex(ROOT), query, kind))
  return 0
}

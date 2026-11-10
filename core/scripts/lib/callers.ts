// callers.ts — the `callers` tool as a command: who calls a method (or what it calls), two levels deep.
//   node .ai/scripts/cli.ts callers <Class::method | function> [--callees] [--depth N]
import { callers, loadIndex } from "../opencode/tool/_lib.ts"
import { ROOT } from "./project.ts"

export function main(argv: string[]): number {
  const d = argv.indexOf("--depth"), depth = d >= 0 ? Number(argv[d + 1]) : 2
  const symbol = argv.filter((a, i) => !a.startsWith("--") && !(d >= 0 && i === d + 1)).join(" ")
  if (!symbol) { console.error("usage: node .ai/scripts/cli.ts callers <Class::method> [--callees] [--depth N]"); return 2 }
  console.log(callers(loadIndex(ROOT), symbol, argv.includes("--callees") ? "callees" : "callers", depth))
  return 0
}

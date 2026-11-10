// gate.ts — the checks that can say NO, for every stack of the project: each stack runs its own gate
// (lib/gate-<stack>.ts) on the changed files under its paths. One stack → its output as is; several → one section
// per stack and a combined RESULT. Exit: 0 pass · 1 fail · 2 a check did not run.
//   node .ai/scripts/cli.ts gate [--base REF] [--skip-drush] [files…]      (wrapper: bash .ai/scripts/gate/run-gate.sh)
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { cfg } from "./project.ts"

const LIB = dirname(fileURLToPath(import.meta.url))

export async function main(argv: string[]): Promise<number> {
  const gates = (cfg().stacks ?? [{ name: "drupal" }]).map((s: any) => s.name).filter((n: string) => existsSync(join(LIB, `gate-${n}.ts`)))
  if (!gates.length) { console.log("No gate for the stacks of project.json — nothing checked.\n\nRESULT: INCOMPLETE (no gate configured)"); return 2 }
  if (gates.length === 1) return (await import(pathToFileURL(join(LIB, `gate-${gates[0]}.ts`)).href)).main(argv)
  let worst = 0
  for (const n of gates) {
    console.log(`\n## Stack ${n}\n`)
    const rc = await (await import(pathToFileURL(join(LIB, `gate-${n}.ts`)).href)).main(argv)
    worst = rc === 1 || worst === 1 ? 1 : Math.max(worst, rc)
  }
  console.log(`\n## All stacks\n\nRESULT: ${worst === 1 ? "FAIL" : worst === 2 ? "INCOMPLETE (a check did not run — never report it as passed)" : "PASS"}`)
  return worst
}

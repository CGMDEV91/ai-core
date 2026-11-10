// codeindex.ts — the code index the tools `where` and `callers` query (.ai/context/code-index.json): each stack of
// project.json contributes its part (lib/codeindex-<stack>.ts → build()), merged section by section.
//   node .ai/scripts/cli.ts codeindex [--update]          (wrapper: bash .ai/scripts/knowledge/scan-index.sh)
import { existsSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { AI, cfg } from "./project.ts"
import { dumps, isFile, read } from "./util.ts"

const OUT = `${AI}/context/code-index.json`
const LIB = dirname(fileURLToPath(import.meta.url))
const EMPTY = () => ({ generated_by: "bash .ai/scripts/knowledge/scan-index.sh --update", methods: {}, classes: {}, services: {},
  routes: {}, events: {}, hooks: {}, fields: {}, strings: {}, mentions: {} })

export async function build(): Promise<any> {
  let data: any = null
  for (const s of cfg().stacks ?? [{ name: "drupal" }]) {
    const f = join(LIB, `codeindex-${s.name}.ts`)
    if (!existsSync(f)) continue
    const part = await (await import(pathToFileURL(f).href)).build()
    if (!data) { data = part; continue }
    for (const [k, v] of Object.entries<any>(part)) {
      if (v && typeof v === "object" && !Array.isArray(v)) data[k] = { ...(data[k] ?? {}), ...v }
      else data[k] ??= v
    }
  }
  return data ?? EMPTY()
}

export async function main(argv: string[]): Promise<number> {
  const data = await build()
  const text = dumps(data, undefined, true, false, [",", ":"]) + "\n"
  const stats = Object.entries(data).filter(([, v]) => v && typeof v === "object").map(([k, v]) => `${Object.keys(v as object).length} ${k}`)
  if (argv.includes("--update")) {
    writeFileSync(OUT, text)
    console.log(`code-index.json written (${Math.floor(statSync(OUT).size / 1024)} KB): ` + stats.join(", "))
    return 0
  }
  console.log(isFile(OUT) && read(OUT) === text ? "NO CHANGES — code index is up to date."
    : "code-index.json is out of date — run: bash .ai/scripts/knowledge/scan-index.sh --update")
  return 0
}

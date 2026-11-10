// opencode.ts — the opencode.json of the project: .ai/scripts/setup/opencode.json (core: rules, skills, agents,
// commands, permissions of the workflow) deep-merged with each stack's .ai/scripts/setup/opencode.<stack>.json
// (its permissions and descriptions). Bash permissions are ordered "*" → allow → ask → deny, so a deny always comes
// after any allow it overlaps. Used by setup (writes it), doctor (compares) and the Claude Code target (translates it).
import { existsSync } from "node:fs"
import { join } from "node:path"
import { AI, cfg } from "./project.ts"
import { read } from "./util.ts"

const isObj = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v)
function merge(a: any, b: any): any {
  if (!isObj(a) || !isObj(b)) return b
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = k in out ? merge(out[k], v) : v
  return out
}
const RANK: Record<string, number> = { allow: 1, ask: 2, deny: 3 }
function orderBash(o: any): void {
  if (!isObj(o)) return
  for (const [k, v] of Object.entries<any>(o)) {
    if (k === "bash" && isObj(v)) o[k] = Object.fromEntries(Object.entries<string>(v).map((e, i) => [e, i] as const)
      .sort((x, y) => (x[0][0] === "*" ? 0 : RANK[x[0][1]] ?? 1) - (y[0][0] === "*" ? 0 : RANK[y[0][1]] ?? 1) || x[1] - y[1]).map(([e]) => e))
    else orderBash(v)
  }
}

export function composed(): any | null {
  const dir = join(AI, "scripts", "setup"), base = join(dir, "opencode.json")
  if (!existsSync(base)) return null
  let out = JSON.parse(read(base))
  const names = (cfg().stacks ?? []).map((s: any) => s.name)
  for (const n of names) { const f = join(dir, `opencode.${n}.json`); if (existsSync(f)) out = merge(out, JSON.parse(read(f))) }
  orderBash(out)
  return out
}
export const composedText = () => { const c = composed(); return c ? JSON.stringify(c, null, 2) + "\n" : null }

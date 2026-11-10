// ocload.ts — load the opencode plugins and tools of this checkout the way opencode does, and say what breaks:
// every exported function of a plugin file is called with a context and must return a hooks object; every tool
// module's default export is called with a `tool()` helper and must return a tool definition with execute().
// Used by /doctor and the tests of every stack. Never touches the session or the ticket.
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { AI, ROOT } from "./project.ts"

/** a stand-in for @opencode-ai/plugin's `tool`: tool(def) → def, tool.schema.* → chainable no-op validators */
function fakeTool(): any {
  const chain: any = new Proxy(function () {}, { get: () => chain, apply: () => chain })
  const tool: any = (def: any) => def
  tool.schema = chain
  return tool
}

export async function check(): Promise<string[]> {
  const problems: string[] = []
  const ctx = { directory: ROOT, worktree: ROOT, client: {}, project: {}, $: null }
  const plugDir = join(AI, "scripts", "opencode", "plugin"), toolDir = join(AI, "scripts", "opencode", "tool")
  for (const f of existsSync(plugDir) ? readdirSync(plugDir).filter((x) => x.endsWith(".ts")) : []) {
    try {
      const m = await import(pathToFileURL(join(plugDir, f)).href)
      for (const [name, fn] of Object.entries(m)) {
        if (typeof fn !== "function") continue
        const hooks = await (fn as any)(ctx)
        if (!hooks || typeof hooks !== "object") problems.push(`plugin ${f}: export ${name} does not return hooks (opencode calls every export)`)
      }
    } catch (e) { problems.push(`plugin ${f}: ${(e as Error).message}`) }
  }
  for (const f of existsSync(toolDir) ? readdirSync(toolDir).filter((x) => x.endsWith(".ts") && !x.startsWith("_")) : []) {
    try {
      const m = await import(pathToFileURL(join(toolDir, f)).href)
      const def = typeof m.default === "function" ? m.default(fakeTool()) : null
      if (!def || typeof def.execute !== "function") problems.push(`tool ${f}: default export does not build a tool with execute()`)
    } catch (e) { problems.push(`tool ${f}: ${(e as Error).message}`) }
  }
  return problems
}

export async function main(): Promise<number> {
  const p = await check()
  console.log(p.length ? p.join("\n") : "opencode plugins and tools load")
  return p.length ? 1 : 0
}

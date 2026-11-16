// project.ts — the project's configuration (.ai/project.json, written by ai-core's installer).
// Missing file or keys → a Drupal project on ddev with code in lib/ (the defaults below).
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { comparePaths, posix, walk } from "./util.ts"

export const AI = posix(resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."))   // .ai/scripts/lib → .ai
/** the folder that holds .ai: the project — or, in a workspace, the plain folder that holds every service's repo */
export const WORKSPACE = posix(dirname(AI))
/** where git, the paths and the tools run: the project, or one service when a command runs for it (cli --service) */
export const ROOT = process.env.AI_ROOT ? posix(resolve(process.env.AI_ROOT)) : WORKSPACE
// Workspace (several repos that call each other): each service is a stack entry with "repo" = its folder under the
// workspace, and its paths relative to that repo. Seen from the workspace, stack() returns the paths with the repo in
// front; inside a service (AI_ROOT / AI_SERVICE, set by `cli.ts --service <repo>`), as written.
export type Stack = { name: string; paths: string[]; configSync: string; apiRoot: string; exec: string; service?: string; [k: string]: unknown }
const DEFAULT: Stack = { name: "drupal", paths: ["lib/modules", "lib/themes"], configSync: "config/sync", apiRoot: "web", exec: "ddev" }

export function cfg(): any {
  const f = `${AI}/project.json`
  try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf-8")) : {} } catch { return {} }
}
export function stack(name = "drupal"): Stack {
  const all = cfg().stacks ?? [], svc = process.env.AI_SERVICE
  const s = (svc && all.find((x: any) => x.repo === svc && x.name === name)) || all.find((x: any) => x.name === name)
  const out: Stack = { ...DEFAULT, ...(s ?? {}) }
  if (out.repo && !process.env.AI_ROOT) {   // seen from the workspace
    const pre = `${out.repo}/`
    out.paths = out.paths.map((p) => pre + p); out.configSync = pre + out.configSync; out.apiRoot = pre + out.apiRoot
    out.root = out.root ? pre + out.root : String(out.repo)
  }
  return out
}
/** the services of a workspace (stack entries with "repo"); [] for a single-repo project */
export const services = (): Stack[] => (cfg().stacks ?? []).filter((s: any) => s.repo)
export const isWorkspace = () => services().length > 0 && !process.env.AI_ROOT
/** How a tool runs where the code runs: ddev · docker (compose service) · local. */
export function runPrefix(s: Stack): string[] {
  if (s.exec === "ddev") return ["ddev", "exec"]
  if (s.exec === "docker") return ["docker", "compose", "exec", "-T", String(s.service ?? "web")]
  return []
}
export const drushPrefix = (s: Stack) => (s.exec === "ddev" ? ["ddev", "drush"] : [...runPrefix(s), "vendor/bin/drush"])
export const codePaths = (s: Stack) => s.paths.map((p) => p.replace(/\/+$/, "") + "/")
/** Every file under the stack's code paths (lib/modules + lib/themes, web/modules/custom…), sorted like pathlib. */
export function walkCode(keep: (abs: string) => boolean = () => true, name = "drupal"): string[] {
  return stack(name).paths.flatMap((p) => walk(`${ROOT}/${p.replace(/\/+$/, "")}`, keep)).sort(comparePaths)
}

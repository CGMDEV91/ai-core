// project.ts — the project's configuration (.ai/project.json, written by ai-core's installer).
// Missing file or keys → a Drupal project on ddev with code in lib/ (the defaults below).
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { comparePaths, posix, walk } from "./util.ts"

export const AI = posix(resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."))   // .ai/scripts/lib → .ai
export const ROOT = posix(dirname(AI))
export type Stack = { name: string; paths: string[]; configSync: string; apiRoot: string; exec: string; service?: string; [k: string]: unknown }
const DEFAULT: Stack = { name: "drupal", paths: ["lib/modules", "lib/themes"], configSync: "config/sync", apiRoot: "web", exec: "ddev" }

export function cfg(): any {
  const f = `${AI}/project.json`
  try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf-8")) : {} } catch { return {} }
}
export function stack(name = "drupal"): Stack {
  const s = (cfg().stacks ?? []).find((x: any) => x.name === name)
  return { ...DEFAULT, ...(s ?? {}) }
}
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

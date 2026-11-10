import { runScript, projectRoot } from "./_lib.ts"

export default (tool: any) => tool({
  description:
    "Run the project's gate on the changed files (or the given ones): phpcs, phpstan, drush cr, drush config:status. " +
    "Returns a pass/fail table, NEW errors (on lines this change touched — must be fixed), PRE-EXISTING ones " +
    "(untouched lines — do not fix in this ticket) and the [VERIFIED …] lines for ## Verification. " +
    "Always use this instead of calling phpcs/phpstan through bash.",
  args: {
    files: tool.schema.array(tool.schema.string()).optional().describe("Paths relative to the project root; empty = the current diff"),
    base: tool.schema.string().optional().describe("Git ref to diff against (default HEAD)"),
    skipDrush: tool.schema.boolean().optional().describe("Only phpcs + phpstan (faster, mid-block)"),
  },
  async execute(args: { files?: string[]; base?: string; skipDrush?: boolean }, ctx: { directory?: string; worktree?: string }) {
    const a: string[] = []
    if (args.base) a.push("--base", args.base)
    if (args.skipDrush) a.push("--skip-drush")
    a.push(...(args.files ?? []))
    return runScript(projectRoot(ctx), "scripts/gate/run-gate.sh", a, 900000)
  },
})

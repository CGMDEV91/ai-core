import { runScript, projectRoot } from "./_lib.ts"

export default (tool: any) => tool({
  description:
    "Every place a concept of the project lives — a status (union_registered), field, role, document type, route or string — " +
    "grouped by kind: option maps, access control, form alters, config/sync, Twig, translations, skills, known issues. " +
    "Use it as the checklist when ADDING or RENAMING something, and for full-text search outside PHP.",
  args: {
    term: tool.schema.string().describe("Literal term to look for"),
    caseSensitive: tool.schema.boolean().optional().describe("Default false"),
  },
  async execute(args: { term: string; caseSensitive?: boolean }, ctx: { directory?: string; worktree?: string }) {
    return runScript(projectRoot(ctx), "scripts/analysis/scan-touchpoints.sh", [args.term, ...(args.caseSensitive ? ["--case"] : [])])
  },
})

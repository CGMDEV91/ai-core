import { runScript, projectRoot } from "./_lib.ts"

export default (tool: any) => tool({
  description:
    "Side effects of a change: which business flows (skills), past bugs (known issues) and past tickets share " +
    "the changed code path, with a re-test checklist. Without files/commit it analyses the current git diff. " +
    "Run it before handing a change over and in reviews. Pass the ticket key to follow its declared skills.",
  args: {
    key: tool.schema.string().optional().describe("Current ticket key (e.g. EUIPOFO-25999)"),
    files: tool.schema.array(tool.schema.string()).optional().describe("Paths relative to the project root, instead of the diff"),
    methods: tool.schema.array(tool.schema.string()).optional().describe("With files: Class::method changed"),
    commit: tool.schema.string().optional().describe("Analyse one existing commit instead"),
    writeTicket: tool.schema.boolean().optional().describe("Also write the ## Impact section of the ticket (needs key)"),
  },
  async execute(args: { key?: string; files?: string[]; methods?: string[]; commit?: string; writeTicket?: boolean }, ctx: { directory?: string; worktree?: string }) {
    const a: string[] = []
    if (args.commit) a.push("--commit", args.commit)
    if (args.files?.length) a.push("--files", ...args.files, ...(args.methods?.length ? ["--methods", ...args.methods] : []))
    if (args.key) a.push(args.writeTicket ? "--write-ticket" : "--key", args.key)
    return runScript(projectRoot(ctx), "scripts/analysis/scan-impact.sh", a)
  },
})

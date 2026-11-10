import { where, loadIndex, projectRoot } from "./_lib.ts"

export default (tool: any) => tool({
  description:
    "Locate the project's code in ONE call — use it BEFORE grep/glob. Finds methods (with exact line ranges), classes, " +
    "services, routes, events, hooks, field_* machine names and UI texts the user sees (t() strings), and says which " +
    "skills and known issues cite each method. Then read only the returned line ranges.",
  args: {
    query: tool.schema.string().describe("Method (Class::method or method), class, service id, route, event, hook, field_xxx, or a UI text fragment"),
    kind: tool.schema.enum(["any", "method", "class", "service", "route", "event", "hook", "field", "string", "integration"]).optional()
      .describe("Restrict the search to one kind (default any)"),
  },
  async execute(args: { query: string; kind?: string }, ctx: { directory?: string; worktree?: string }) {
    return where(loadIndex(projectRoot(ctx)), args.query, args.kind ?? "any")
  },
})

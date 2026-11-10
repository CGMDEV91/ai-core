import { callers, loadIndex, projectRoot } from "./_lib.ts"

export default (tool: any) => tool({
  description:
    "Who calls a method of the project (or what it calls), two levels deep, including Drupal entry points that reach it " +
    "(route, event subscription, hook). Use it to judge the blast radius of changing a method before editing it.",
  args: {
    method: tool.schema.string().describe("Class::method or method name"),
    direction: tool.schema.enum(["callers", "callees"]).optional().describe("callers (default) or callees"),
  },
  async execute(args: { method: string; direction?: "callers" | "callees" }, ctx: { directory?: string; worktree?: string }) {
    return callers(loadIndex(projectRoot(ctx)), args.method, args.direction ?? "callers")
  },
})

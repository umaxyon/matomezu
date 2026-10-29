// 道具の切り替え: そのステージの道具を、道具の組の回す順（core/def/tool.ts の ToolSetDef）で次の使える道具へ替えるコマンド。紙のあるステージだけに出す
import { paperOf } from "../../../core/stage"
import { nextTool, toolIn, toolSetOf, toolUsable } from "../../../core/tools"
import { kit } from "../kit"

export const TOOL_NEXT = kit.defineCommand({
  id: "tool-next",
  title: "Switch tool",
  run: (ctx, a) => {
    const set = toolSetOf(ctx.catalog, ctx.stage)
    const usable = (tool: string) => toolUsable(ctx.catalog, tool, ctx.book, ctx.stage.opened?.page ?? null)
    if (set)
      a.setTool(
        ctx.stage.id,
        nextTool(ctx.catalog, set, ctx.stage.tool ?? toolIn(ctx.catalog, ctx.workspace.tools, set), usable),
      )
  },
  when: ctx => paperOf(ctx.stage) !== null && toolSetOf(ctx.catalog, ctx.stage) !== null,
})

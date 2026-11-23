// 道具の切り替え: そのステージの道具を、道具の組の回す順（core/def/tool.ts の ToolSetDef）で次の使える道具へ替えるコマンド。紙のあるステージだけに出す
import { NO_PAPER, paperOf } from "../../../core/stage"
import { NO_TOOL, nextTool, toolIn, toolSetOf, toolUsable } from "../../../core/tools"
import { askedIn, workspaceOf } from "../../../store/commands/def"
import { kit } from "../kit"
import { hasOpenedPage } from "../utils/opened-page"

export const TOOL_NEXT = kit.defineCommand({
  id: "tool-next",
  title: "Switch tool",
  run: (ctx, a) => {
    const set = toolSetOf(ctx.catalog, ctx.stage)
    const usable = (tool: string) =>
      toolUsable(ctx.catalog, tool, askedIn(ctx) ?? null, hasOpenedPage(ctx) ? ctx.page.id : null)
    if (set)
      a.setTool(
        nextTool(
          ctx.catalog,
          set,
          ctx.stage.tool !== NO_TOOL ? ctx.stage.tool : toolIn(ctx.catalog, workspaceOf(ctx).tools, set),
          usable,
        ),
      )
  },
  when: ctx => paperOf(ctx.stage) !== NO_PAPER && toolSetOf(ctx.catalog, ctx.stage) !== null,
})
export { HAND_TOOL, SELECT_TOOL } from "./tools"

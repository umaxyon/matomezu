// 道具の切り替え: そのステージの道具を、道具の組の回す順（core/tools.ts の TOOL_SETS）で次へ替えるコマンド。紙のあるステージだけに出す
import { paperOf } from "../../../core/stage"
import { nextTool, toolIn, toolSetOf } from "../../../core/tools"
import { defineCommand } from "../../../store/commands/def"

export const TOOL_NEXT = defineCommand({
  id: "tool.next",
  title: "Switch tool",
  run: (ctx, a) => {
    const set = toolSetOf(ctx.catalog, ctx.stage)
    if (set) a.setTool(ctx.stage.id, nextTool(set, toolIn(ctx.workspace.tools, set)))
  },
  when: ctx => paperOf(ctx.stage) !== null && toolSetOf(ctx.catalog, ctx.stage) !== null,
})

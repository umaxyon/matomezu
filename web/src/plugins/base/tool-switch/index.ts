// 道具の切り替え: そのステージの道具を、回す順（core/stage.ts の TOOLS）で次へ替えるコマンド。紙のあるステージだけに出す
import { nextTool, paperOf } from "../../../core/stage"
import { defineCommand } from "../../../store/commands/def"

export const TOOL_NEXT = defineCommand({
  id: "tool.next",
  title: "Switch tool",
  run: (ctx, a) => a.setTool(ctx.stage.id, nextTool(ctx.stage.tool)),
  when: ctx => paperOf(ctx.stage) !== null,
})

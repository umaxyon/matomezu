// 道具のアイコン: ポインタのすぐ近くに道具のアイコンを並べて出し、押した道具にする（右ボタンの長押しか Space で開く）。
// 道具を替えるコマンドと、開くコマンド（キーの既定は、ステージの範囲の Space）
import { paperOf, type Tool } from "../../../core/stage"
import { defineCommand } from "../../../store/commands/def"
import { defineKeys } from "../../../store/keys"

export const TOOL_SET = defineCommand({
  id: "tool.set",
  title: "Set tool",
  run: (ctx, a, tool: Tool) => a.setTool(ctx.stage.id, tool),
  when: ctx => paperOf(ctx.stage) !== null,
})

// 開く所は画面が決める（最後のポインタの位置。ステージの外なら真ん中）
export const TOOL_PICKER = defineCommand({
  id: "tool.picker",
  title: "Tool picker",
  run: (ctx, a) => a.openPicker(ctx.stage.id, null),
  when: ctx => paperOf(ctx.stage) !== null,
})

export const TOOL_PICKER_KEYS = defineKeys([{ key: "Space", command: "tool.picker", scope: "stage" }])

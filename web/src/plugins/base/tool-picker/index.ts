// 道具のアイコン: ポインタのすぐ近くに道具のアイコンを並べて出し、押した道具にする（右ボタンの長押しか Space で開く）。
// 道具を替えるコマンドと、開くコマンド（キーの既定は、ステージの範囲の Space）

import type { ToolId } from "../../../core/catalog"
import { paperOf } from "../../../core/stage"
import { defineKeys } from "../../../store/keys"
import { kit } from "../kit"

export const TOOL_SET = kit.defineCommand({
  id: "tool-set",
  title: "Set tool",
  run: (ctx, a, tool: ToolId) => a.setTool(ctx.stage.id, tool),
  when: ctx => paperOf(ctx.stage) !== null,
})

// 開く所は画面が決める（最後のポインタの位置。ステージの外なら真ん中）
export const TOOL_PICKER = kit.defineCommand({
  id: "tool-picker",
  title: "Tool picker",
  run: (ctx, a) => a.openPicker(ctx.stage.id, null),
  when: ctx => paperOf(ctx.stage) !== null,
})

export const TOOL_PICKER_KEYS = defineKeys([{ key: "Space", command: TOOL_PICKER.id, scope: "stage" }])

// 道具のアイコン: ポインタのすぐ近くに道具のアイコンを並べて出し、押した道具にする（右ボタンの長押しか Space で開く）。
// 道具を替えるコマンドと、開くコマンド（キーの既定は、ステージの範囲の Space）と、閉じるコマンド（キーの既定は、道具のアイコンが開いている間の範囲 picker の Escape と Space。
// Space で開いた道具のアイコンは、もう一度 Space で閉じる）

import type { ToolId } from "../../../core/catalog"
import { paperOf, shownPageId } from "../../../core/stage"
import { toolUsable } from "../../../core/tools"
import { calledStageOf, NO_BOOK } from "../../../store/commands/def"
import { kit } from "../kit"

export const TOOL_SET = kit.defineCommand({
  id: "tool-set",
  title: "Set tool",
  run: (ctx, a, tool: ToolId) => {
    if (
      toolUsable(
        ctx.catalog,
        tool,
        ctx.book === NO_BOOK ? null : ctx.book,
        shownPageId(ctx.stage.opened ?? null) ?? null,
      )
    )
      a.setTool(tool)
  },
  when: ctx => paperOf(ctx.stage) !== null,
})

// 開く所は画面が決める（最後のポインタの位置。ステージの外なら真ん中）
export const TOOL_PICKER = kit.defineCommand({
  id: "tool-picker",
  title: "Tool picker",
  run: (_ctx, a) => a.openPicker(null),
  when: ctx => paperOf(ctx.stage) !== null,
})

// 開いているかは、呼ばれたステージの状態から読む（プラグイン API には出さない）
export const TOOL_PICKER_CLOSE = kit.defineCommand({
  id: "tool-picker-close",
  title: "Close tool picker",
  run: (_ctx, a) => a.closePicker(),
  when: ctx => (calledStageOf(ctx)?.picker ?? null) !== null,
})

export const TOOL_PICKER_KEYS = [
  kit.defineKey({ id: "tool-picker-space", key: "Space", command: TOOL_PICKER.id, scope: "stage" }),
  kit.defineKey({ id: "tool-picker-close-escape", key: "Escape", command: TOOL_PICKER_CLOSE.id, scope: "picker" }),
  kit.defineKey({ id: "tool-picker-close-space", key: "Space", command: TOOL_PICKER_CLOSE.id, scope: "picker" }),
]
export { TOOL_PICKER_HOLD } from "./hold"

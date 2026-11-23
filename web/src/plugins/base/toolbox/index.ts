// ツールボックスのコマンド: 置こうとしているアイテムを取り消す。何も置こうとしていない背景編集モードの間は、モードを終える（キーの既定は Escape）
import { editingBackground, NO_PLACING } from "../../../core/stage"
import { kit } from "../kit"

export const TOOLBOX_CANCEL = kit.defineCommand({
  id: "toolbox-cancel",
  title: "Cancel placing",
  run: (ctx, a) => (ctx.stage.placing !== NO_PLACING ? a.stopPlacing() : a.endBackground()),
  when: ctx => ctx.stage.placing !== NO_PLACING || editingBackground(ctx.stage),
})

export const TOOLBOX_KEYS = [
  kit.defineKey({ id: "toolbox-cancel-escape", key: "Escape", command: TOOLBOX_CANCEL.id, scope: "stage" }),
]

import type {} from "./toolbox"

// ツールボックスのコマンド: 置こうとしているアイテムを取り消す。何も置こうとしていない背景編集モードの間は、モードを終える（キーの既定は Escape）
import { editingBackground } from "../../../core/stage"
import { kit } from "../kit"

export const TOOLBOX_CANCEL = kit.defineCommand({
  id: "toolbox-cancel",
  title: "Cancel placing",
  run: (ctx, a) => (ctx.stage.placing !== null ? a.here.stopPlacing() : a.here.endBackground()),
  when: ctx => ctx.stage.placing !== null || editingBackground(ctx.stage),
})

export const TOOLBOX_KEYS = [
  kit.defineKey({ id: "toolbox-cancel-escape", key: "Escape", command: TOOLBOX_CANCEL.id, scope: "stage" }),
]

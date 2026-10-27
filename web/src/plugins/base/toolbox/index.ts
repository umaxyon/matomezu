// ツールボックスのコマンド: 置こうとしているアイテムを取り消す（キーの既定は Escape）
import { kit } from "../kit"

export const TOOLBOX_CANCEL = kit.defineCommand({
  id: "toolbox-cancel",
  title: "Cancel placing",
  run: (ctx, a) => a.stopPlacing(ctx.stage.id),
  when: ctx => ctx.stage.placing !== null,
})

export const TOOLBOX_KEYS = [
  kit.defineKey({ id: "toolbox-cancel-escape", key: "Escape", command: TOOLBOX_CANCEL.id, scope: "stage" }),
]

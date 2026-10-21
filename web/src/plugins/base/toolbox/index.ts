// ツールボックスのコマンド: 置こうとしているアイテムを取り消す（キーの既定は Escape）
import { defineCommand } from "../../../store/commands/def"
import { defineKeys } from "../../../store/keys"

export const TOOLBOX_CANCEL = defineCommand({
  id: "toolbox.cancel",
  title: "Cancel placing",
  run: (ctx, a) => a.stopPlacing(ctx.stage.id),
  when: ctx => ctx.stage.placing !== null,
})

export const TOOLBOX_KEYS = defineKeys([{ key: "Escape", command: "toolbox.cancel", scope: "stage" }])

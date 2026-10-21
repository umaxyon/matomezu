// ダイアログのコマンド: 開いているダイアログを決める・閉じる（キーの既定は Enter と Escape）
import { defineCommand } from "../../../store/commands/def"
import { defineKeys } from "../../../store/keys"

export const DIALOG_SUBMIT = defineCommand({
  id: "dialog.submit",
  title: "Confirm dialog",
  run: (_ctx, a) => a.submitDialog(),
  when: ctx => ctx.dialog !== null,
})

export const DIALOG_CLOSE = defineCommand({
  id: "dialog.close",
  title: "Close dialog",
  run: (_ctx, a) => a.closeDialog(),
  when: ctx => ctx.dialog !== null,
})

export const DIALOG_KEYS = defineKeys([
  { key: "Enter", command: "dialog.submit", scope: "dialog" },
  { key: "Escape", command: "dialog.close", scope: "dialog" },
])

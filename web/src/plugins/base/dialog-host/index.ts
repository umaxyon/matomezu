// ダイアログのコマンド: 開いているダイアログを決める・閉じる（キーの既定は Enter と Escape）
import { defineKeys } from "../../../store/keys"
import { kit } from "../kit"

export const DIALOG_SUBMIT = kit.defineCommand({
  id: "dialog-submit",
  title: "Confirm dialog",
  run: (_ctx, a) => a.submitDialog(),
  when: ctx => ctx.dialog !== null,
})

export const DIALOG_CLOSE = kit.defineCommand({
  id: "dialog-close",
  title: "Close dialog",
  run: (_ctx, a) => a.closeDialog(),
  when: ctx => ctx.dialog !== null,
})

export const DIALOG_KEYS = defineKeys([
  { key: "Enter", command: "@matomezu/base:dialog-submit", scope: "dialog" },
  { key: "Escape", command: "@matomezu/base:dialog-close", scope: "dialog" },
])

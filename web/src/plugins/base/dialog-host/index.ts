// ダイアログのコマンド: 開いているダイアログを決める・閉じる（キーの既定は Enter と Escape）
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

export const DIALOG_KEYS = [
  kit.defineKey({ id: "dialog-submit-enter", key: "Enter", command: DIALOG_SUBMIT.id, scope: "dialog" }),
  kit.defineKey({ id: "dialog-close-escape", key: "Escape", command: DIALOG_CLOSE.id, scope: "dialog" }),
]

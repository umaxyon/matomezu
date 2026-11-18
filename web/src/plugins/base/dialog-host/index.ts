// ダイアログのコマンド: 開いているダイアログを決める・閉じる（キーの既定は Enter と Escape）。ステージを持たないスクリーンから出したダイアログにも効くよう、スクリーンから呼ぶコマンド
import { kit } from "../kit"

export const DIALOG_SUBMIT = kit.defineScreenCommand({
  id: "dialog-submit",
  title: "Confirm dialog",
  run: (_ctx, a) => a.submitDialog(),
  when: ctx => ctx.dialog !== null,
})

export const DIALOG_CLOSE = kit.defineScreenCommand({
  id: "dialog-close",
  title: "Close dialog",
  run: (_ctx, a) => a.closeDialog(),
  when: ctx => ctx.dialog !== null,
})

export const DIALOG_KEYS = [
  kit.defineKey({ id: "dialog-submit-enter", key: "Enter", command: DIALOG_SUBMIT.id, scope: "dialog" }),
  kit.defineKey({ id: "dialog-close-escape", key: "Escape", command: DIALOG_CLOSE.id, scope: "dialog" }),
]

declare module "../../../core/catalog" {
  interface DialogExtras<A = undefined> {
    // 物を直すダイアログが、開くときの値 args から返す、直している物の id（ブックの中の物）。開いている間、ダイアログの置き場がその物に編集ロックを掛ける
    edits?(args: A): readonly string[]
  }
}

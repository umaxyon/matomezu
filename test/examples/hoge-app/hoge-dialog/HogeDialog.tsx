// hoge のダイアログ。枠は土台のダイアログを使う
import { Dialog } from "../../../../web/src/ui/dialog/Dialog"
import type { DialogProps } from "../../../../web/src/ui/plugin"
import styles from "./HogeDialog.module.css"
import { greeting } from "./logic"

export function HogeDialog({ onClose }: DialogProps) {
  return (
    <Dialog title="hoge" onClose={onClose}>
      <p className={styles.body}>{greeting("matomezu")}</p>
    </Dialog>
  )
}

// 中の「新しいブック」のダイアログの差し替え
export function MyNewBookDialog({ onClose }: DialogProps) {
  return (
    <Dialog title="my new book" onClose={onClose}>
      <button type="button" onClick={onClose}>
        close
      </button>
    </Dialog>
  )
}

// hoge のダイアログ。枠は base のダイアログを使う
import { Dialog, type DialogProps, useT } from "matomezu/ui"
import styles from "./HogeDialog.module.css"
import { shout } from "./logic"

// 文言は自分の文言の表から t() で出す
export function HogeDialog({ onClose }: DialogProps) {
  const t = useT()
  return (
    <Dialog title={t("hoge")} onClose={onClose}>
      <p className={styles.body}>{t("hello, {name}", { name: shout("matomezu") })}</p>
    </Dialog>
  )
}

// 中の「新しいブック」のダイアログの差し替え
export function MyNewBookDialog({ onClose }: DialogProps) {
  const t = useT()
  return (
    <Dialog title={t("Instead of a new book")} onClose={onClose}>
      <button type="button" onClick={onClose}>
        {t("Close")}
      </button>
    </Dialog>
  )
}

// hoge のダイアログ。枠は土台のダイアログを使う
import { Dialog } from "../../../../web/src/ui/dialog/Dialog"
import { useT } from "../../../../web/src/ui/i18n"
import type { DialogProps } from "../../../../web/src/ui/plugin"
import styles from "./HogeDialog.module.css"
import { shout } from "./logic"

// 文言は自分の文言の表から t() で出す
export function HogeDialog({ onClose }: DialogProps) {
  const t = useT()
  return (
    <Dialog title={t("hoge")} onClose={onClose}>
      <p className={styles.body}>{t("こんにちは、{name}", { name: shout("matomezu") })}</p>
    </Dialog>
  )
}

// 中の「新しいブック」のダイアログの差し替え
export function MyNewBookDialog({ onClose }: DialogProps) {
  const t = useT()
  return (
    <Dialog title={t("新しいブックの代わり")} onClose={onClose}>
      <button type="button" onClick={onClose}>
        {t("閉じる")}
      </button>
    </Dialog>
  )
}

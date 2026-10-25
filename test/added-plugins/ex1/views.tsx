// ex1 のダイアログ・ボタン・アイコン。枠は base のダイアログを使う
import { Dialog, type DialogProps, useCommand, useT } from "matomezu/ui"
import { shout } from "./shout"
import styles from "./views.module.css"

export function HelloDialog({ onClose }: DialogProps) {
  const t = useT()
  return (
    <Dialog title={t("ex1/sayHello")} onClose={onClose}>
      <p className={styles.greeting}>{t("ex1/helloName", { name: shout("matomezu") })}</p>
    </Dialog>
  )
}

export function InspectDialog({ args, onClose }: DialogProps<{ item: string }>) {
  const t = useT()
  return (
    <Dialog title={t("ex1/inspectItem")} onClose={onClose}>
      <p>{t("ex1/itemId", { id: args.item })}</p>
    </Dialog>
  )
}

// ビルトインのページの設定のダイアログの差し替え
export function PageSettingsInstead({ onClose }: DialogProps<{ page: string }>) {
  const t = useT()
  return (
    <Dialog title={t("ex1/pageSettings")} onClose={onClose}>
      <button type="button" onClick={onClose}>
        {t("ex1/close")}
      </button>
    </Dialog>
  )
}

// ステージの上の行に置くボタン: そのステージから自分のコマンドを呼ぶ
export function Ex1Buttons({ stage }: { stage: string }) {
  const hello = useCommand(stage, "ex1/hello")
  const lang = useCommand(stage, "ex1/lang")
  const t = useT()
  return (
    <div>
      <button type="button" onClick={() => hello.run()}>
        {t(hello.title)}
      </button>
      <button type="button" onClick={() => lang.run("en")}>
        {t(lang.title)}
      </button>
    </div>
  )
}

export const HELLO_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8" />
  </svg>
)

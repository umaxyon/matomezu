// ex1 のダイアログ・ボタン・アイコン。枠は base のダイアログを使う
import { Dialog, type DialogProps, useCommand, useT } from "matomezu/ui"
import { shout } from "./shout"
import styles from "./views.module.css"

export function HelloDialog({ onClose }: DialogProps) {
  const t = useT()
  return (
    <Dialog title={t("Say hello")} onClose={onClose}>
      <p className={styles.greeting}>{t("Hello, {name}", { name: shout("matomezu") })}</p>
    </Dialog>
  )
}

export function InspectDialog({ args, onClose }: DialogProps<{ item: string }>) {
  const t = useT()
  return (
    <Dialog title={t("Inspect item")} onClose={onClose}>
      <p>{t("Item {id}", { id: args.item })}</p>
    </Dialog>
  )
}

// ビルトインのページの設定のダイアログの差し替え
export function PageSettingsInstead({ onClose }: DialogProps<{ page: string }>) {
  const t = useT()
  return (
    <Dialog title={t("Page settings by ex1")} onClose={onClose}>
      <button type="button" onClick={onClose}>
        {t("Close")}
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

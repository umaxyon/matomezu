// ex1 のダイアログ・ボタン・アイコン。枠は base のダイアログを使う
import { Dialog, type DialogProps, useCommand, useMessages } from "matomezu/ui"
import { HELLO, SWITCH_LANG } from "."
import { kit } from "./kit"
import { shout } from "./shout"
import styles from "./views.module.css"

export function HelloDialog({ onClose }: DialogProps) {
  const t = useMessages(kit)
  return (
    <Dialog title={t("sayHello")} onClose={onClose}>
      <p className={styles.greeting}>{t("helloName", { name: shout("matomezu") })}</p>
    </Dialog>
  )
}

export function InspectDialog({ args, onClose }: DialogProps<{ item: string }>) {
  const t = useMessages(kit)
  return (
    <Dialog title={t("inspectItem")} onClose={onClose}>
      <p>{t("itemId", { id: args.item })}</p>
    </Dialog>
  )
}

// ビルトインのページの設定のダイアログの差し替え
export function PageSettingsInstead({ onClose }: DialogProps<{ page: string }>) {
  const t = useMessages(kit)
  return (
    <Dialog title={t("pageSettings")} onClose={onClose}>
      <button type="button" onClick={onClose}>
        {t("close")}
      </button>
    </Dialog>
  )
}

// ステージの上の行に置くボタン: そのステージから自分のコマンドを呼ぶ
export function Ex1Buttons({ stage }: { stage: string }) {
  const hello = useCommand(stage, HELLO.id)
  const lang = useCommand(stage, SWITCH_LANG.id)
  const t = useMessages(kit)
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

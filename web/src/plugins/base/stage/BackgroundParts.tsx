// 背景編集モードの画面の部品: 上の帯（編集中の表示と、終了・中身を隠すボタン。ウィジェット background-band。ステージのレイヤー）、
// フッタの「背景を編集」ボタン（background-button）、フッタの「背景の印刷」の 3 つのボタン（background-print-control。中身があれば・必ず・出さない。背景編集モードの間だけ）

import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useCatalog } from "../../../ui/store-context"
import { useBook, usePage } from "../../../ui/view-hooks"
import { settingValue } from "../book-settings"
import { kit } from "../kit"
import { BACKGROUND_PRINT, type BackgroundPrint } from "../print-preview/settings"
import footer from "../utils/FooterButtons.module.css"
import type { StageSlotProps } from "../workspace/ui"
import styles from "./BackgroundParts.module.css"
import { BACKGROUND_END, BACKGROUND_HIDE_CONTENT, BACKGROUND_PRINT_SET, BACKGROUND_TOGGLE } from "./background"

export function BackgroundBand({ stage }: StageSlotProps) {
  const t = useMessages(kit)
  const end = useCommand(stage, BACKGROUND_END.id)
  const hide = useCommand(stage, BACKGROUND_HIDE_CONTENT.id)
  if (!end.shown) return null
  return (
    <div className={styles.band} role="toolbar" aria-label={t("Editing background")} data-background-band>
      <span className={styles.label}>{t("Editing background")}</span>
      <button type="button" className={styles.button} onClick={() => end.run()}>
        {t(end.title)}
      </button>
      <button type="button" className={styles.button} aria-pressed={hide.active} onClick={() => hide.run()}>
        {t(hide.title)}
      </button>
    </div>
  )
}

export function BackgroundButton({ stage }: { stage: string }) {
  const t = useMessages(kit)
  const toggle = useCommand(stage, BACKGROUND_TOGGLE.id)
  if (!toggle.shown) return null
  return (
    <button
      type="button"
      className={footer.item}
      aria-label={t(toggle.title)}
      title={t(toggle.title)}
      aria-pressed={toggle.active}
      onClick={() => toggle.run()}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 15l5-4 4 3 4-5 5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  )
}

// 背景の印刷（自動・する・しない）。自動は、中身の載った印刷区画にだけ背景を敷く
export function BackgroundPrintControl({ stage }: { stage: string }) {
  const t = useMessages(kit)
  const set = useCommand(stage, BACKGROUND_PRINT_SET.id)
  const catalog = useCatalog().core
  const book = useBook(stage)
  const page = usePage(stage)
  if (!set.shown || !book || !page) return null
  const now = settingValue(catalog, book, page, BACKGROUND_PRINT)
  const choices: { value: BackgroundPrint; label: string }[] = [
    { value: "auto", label: t("Background if filled") },
    { value: "always", label: t("Background always") },
    { value: "never", label: t("Background never") },
  ]
  return (
    <fieldset className={styles.print} aria-label={t("Print background")} data-background-print>
      <span className={styles.printLabel}>{t("Print background")}</span>
      {choices.map(c => (
        <button
          key={c.value}
          type="button"
          className={styles.choice}
          aria-pressed={now === c.value}
          disabled={!set.enabled}
          onClick={() => set.run({ mode: c.value })}
        >
          {c.label}
        </button>
      ))}
    </fieldset>
  )
}

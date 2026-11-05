// 左サイドパネルを開くボタン（ウィジェット left-side-panel-button。フッタメニューに置く）。押すと最初のタブを開き、開いていれば閉じる。タブが無ければ出さない
import { useMessages } from "../../../ui/i18n"
import styles from "../book-name/StageMenuButtons.module.css"
import { kit } from "../kit"
import type { StageSlotProps } from "../workspace/ui"
import { useLeftSidePanel, useLeftSidePanelTabs, useSetLeftSidePanel } from "./hooks"

export function LeftSidePanelButton({ stage }: StageSlotProps) {
  const t = useMessages(kit)
  const tabs = useLeftSidePanelTabs()
  const open = useLeftSidePanel(stage)
  const set = useSetLeftSidePanel()
  const first = tabs[0]
  if (!first) return null
  return (
    <button
      type="button"
      className={styles.item}
      aria-label={t("Open the left side panel")}
      title={t("Open the left side panel")}
      aria-pressed={open !== null}
      data-left-side-panel-opener
      onClick={() => set(stage, open === null ? first : null)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 4v16M5 8h2M5 11h2M5 14h2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  )
}

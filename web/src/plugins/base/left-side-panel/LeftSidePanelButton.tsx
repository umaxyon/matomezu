// 左サイドパネルを開くボタン（ウィジェット left-side-panel-button。フッタメニューに置く）。押すと最初のタブを開き、開いていれば閉じる。タブが無ければ出さない。
// タブが数（未読など。タブの定義の useCount）を答えれば、その合計を角に出す
import { useMessages } from "../../../ui/i18n"
import { useUiCatalog } from "../../../ui/view-hooks"
import styles from "../book-name/StageMenuButtons.module.css"
import { kit } from "../kit"
import type { StageSlotProps } from "../workspace/ui"
import { useLeftSidePanel, useLeftSidePanelTabs, useSetLeftSidePanel } from "./hooks"
import own from "./LeftSidePanel.module.css"

export function LeftSidePanelButton({ stage }: StageSlotProps) {
  const t = useMessages(kit)
  const tabs = useLeftSidePanelTabs()
  const open = useLeftSidePanel(stage)
  const set = useSetLeftSidePanel()
  const widgets = useUiCatalog().widgets
  const first = tabs[0]
  if (!first) return null
  const counters = tabs.flatMap(id => {
    const use = widgets.get(id)?.leftSidePanel?.useCount
    return use ? [use] : []
  })
  return (
    <button
      type="button"
      className={`${styles.item} ${own.opener}`}
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
      <Count counters={counters} />
    </button>
  )
}

// タブの数の合計（0 なら出さない）。タブの並びは変わらないので、フックを呼ぶ数も変わらない
function Count({ counters }: { counters: readonly (() => number)[] }) {
  const t = useMessages(kit)
  const total = counters.map(use => use()).reduce((a, b) => a + b, 0)
  if (total === 0) return null
  return (
    <span className={own.count} title={t("{n} unread", { n: total })} data-count={total}>
      {total > 99 ? "99+" : total}
    </span>
  )
}

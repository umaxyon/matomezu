// 左サイドパネルを開くボタン: 渡すタブの組 entries で開き、今と同じ組を開いていれば閉じる（押されている印も、同じ組を開いているときだけ）。
// 渡すタブが数（未読など。タブの定義の useCount）を答えれば、その合計を角に出す

import { useMessages } from "../../../ui/i18n"
import { useUiCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import styles from "../utils/FooterButtons.module.css"
import { useLeftSidePanelShows, useToggleLeftSidePanel } from "./hooks"
import own from "./LeftSidePanel.module.css"
import type { LeftSidePanelEntry } from "./state"

export function LeftSidePanelOpenButton({ entries }: { entries: readonly LeftSidePanelEntry[] }) {
  const t = useMessages(kit)
  const toggle = useToggleLeftSidePanel()
  const widgets = useUiCatalog().widgets
  const counters = entries.flatMap(e => {
    const use = widgets.get(e.tab)?.leftSidePanel?.useCount
    return use ? [{ id: e.tab, use }] : []
  })
  return (
    <button
      type="button"
      className={`${styles.item} ${own.opener}`}
      aria-label={t("Open the left side panel")}
      title={t("Open the left side panel")}
      aria-pressed={useLeftSidePanelShows(entries)}
      data-left-side-panel-opener
      onClick={() => toggle(entries)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 4v16M5 8h2M5 11h2M5 14h2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <Count key={counters.map(c => c.id).join("|")} counters={counters.map(c => c.use)} />
    </button>
  )
}

// タブの数の合計（0 なら出さない）。数を答えるタブの並びが変わったら key が変わって作り直すので、1 つの間はフックを呼ぶ数が変わらない
function Count({ counters }: { counters: readonly (() => number)[] }) {
  return <CornerCount total={counters.map(use => use()).reduce((a, b) => a + b, 0)} />
}

// フッタのボタンの角に出す未読の数（0 なら出さない）。置くボタンは position: relative にする（opener の class）
export function CornerCount({ total }: { total: number }) {
  const t = useMessages(kit)
  if (total === 0) return null
  return (
    <span className={own.count} title={t("{n} unread", { n: total })} data-count={total}>
      {total > 99 ? "99+" : total}
    </span>
  )
}

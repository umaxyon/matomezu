// 左にタブを縦に並べ、右に選んだタブの見出しと中身を出す形（設定画面・プロジェクト設定など）。右の中身だけがスクロールする。
// どのタブを選んでいるかは使う側が持つ（selected が tabs に無ければ先頭）。要素の id は置いた所ごとに振る
import { type ReactNode, useId } from "react"
import styles from "./SideTabs.module.css"

export interface SideTab {
  id: string
  title: string // 見出しにも使う（訳した文）
}

export function SideTabs({
  tabs,
  selected,
  onSelect,
  children,
}: {
  tabs: readonly SideTab[]
  selected: string | undefined
  onSelect: (id: string) => void
  children: ReactNode // 選んだタブの中身
}) {
  const shown = tabs.find(t => t.id === selected) ?? tabs[0]
  const base = useId()
  const tabId = (tab: string) => `${base}-tab-${tab}`
  const panelId = `${base}-panel`
  return (
    <div className={styles.frame}>
      <div className={styles.tabs} role="tablist" aria-orientation="vertical">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={tabId(t.id)}
            aria-selected={t.id === shown?.id}
            aria-controls={panelId}
            className={styles.tab}
            onClick={() => onSelect(t.id)}
          >
            {t.title}
          </button>
        ))}
      </div>
      {shown && (
        <section id={panelId} role="tabpanel" aria-labelledby={tabId(shown.id)} className={styles.panel}>
          <h3 className={styles.title}>{shown.title}</h3>
          {children}
        </section>
      )}
    </div>
  )
}

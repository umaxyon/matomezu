// 左サイドパネルの入れ物: 窓の左に、上から下まで出す（window/WindowView.tsx が描く）。開いている間は、右にある画面（ブックスクリーンかコントロールセンター）を押し縮める（窓が狭ければ、画面の幅が 0 になる）。
// 上にタブの行と閉じるボタンを置き、中身は、開く側が渡したタブの組のうち開いているタブの 1 つだけを、渡された物のまま描く。タブの名前はウィジェットの定義の leftSidePanel.title。
// 開いたら中にフォーカスを入れ、Esc は左サイドパネルのキーの範囲で閉じる。外を押しても閉じない（閉じるのは、閉じるボタン・Esc・開くボタン）
import { type ReactNode, useEffect, useRef } from "react"
import { useMessages, useT } from "../../../ui/i18n"
import { StageScope } from "../../../ui/scope"
import { useUiCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { useCloseLeftSidePanel, useLeftSidePanel, useSetLeftSidePanelTab } from "./hooks"
import styles from "./LeftSidePanel.module.css"
import { LEFT_SIDE_PANEL } from "./slots"
import type { LeftSidePanelEntry, LeftSidePanelOpen } from "./state"

export const LEFT_SIDE_PANEL_WIDTH = 400 // 開いているときの幅（px。窓より広ければ窓の幅になる）

export function LeftSidePanel() {
  const t = useMessages(kit)
  const opened = useLeftSidePanel()
  const width = opened ? `min(${LEFT_SIDE_PANEL_WIDTH}px, 100vw)` : 0
  return (
    <aside
      className={styles.panel}
      style={{ width }}
      aria-hidden={!opened}
      inert={!opened}
      aria-label={t("Left side panel")}
      data-left-side-panel
    >
      {opened && <Opened open={opened} width={width} />}
    </aside>
  )
}

function Opened({ open, width }: { open: LeftSidePanelOpen; width: string | number }) {
  const t = useMessages(kit)
  const tr = useT()
  const ref = useRef<HTMLDivElement>(null)
  const close = useCloseLeftSidePanel()
  const setTab = useSetLeftSidePanelTab()
  const widgets = useUiCatalog().widgets
  // 開いたら中にフォーカスを入れる（Esc を左サイドパネルのキーの範囲で受けるため）
  useEffect(() => {
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus({ preventScroll: true })
  }, [])
  const current = open.entries.find(e => e.tab === open.tab)
  return (
    <div ref={ref} className={styles.opened} style={{ width }} tabIndex={-1} data-key-scope={LEFT_SIDE_PANEL}>
      <div className={styles.head}>
        <div className={styles.tabs} role="tablist">
          {open.entries.map(({ tab: id }) => {
            const title = widgets.get(id)?.leftSidePanel?.title
            const useCount = widgets.get(id)?.leftSidePanel?.useCount
            return (
              <button
                key={id}
                type="button"
                role="tab"
                className={styles.tab}
                aria-selected={id === open.tab}
                onClick={() => setTab(id)}
              >
                {title ? tr(title) : id}
                {useCount && <TabCount use={useCount} />}
              </button>
            )
          })}
        </div>
        <button type="button" className={styles.close} aria-label={t("Close the left side panel")} onClick={close}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div className={styles.body} role="tabpanel">
        {current && <Content entry={current} />}
      </div>
    </div>
  )
}

// 開いているタブの中身: 開いているタブのウィジェットを、開く側が渡した物のまま描く。タブがステージを名指していれば、そのステージを描いている場所にする（ui/scope.tsx）
function Content({ entry }: { entry: LeftSidePanelEntry }) {
  const View = useUiCatalog().widgets.get(entry.tab)?.view as ((props: unknown) => ReactNode) | undefined
  if (!View) return null
  const view = <View {...(entry.props as object)} />
  return entry.stage === undefined ? view : <StageScope stage={entry.stage}>{view}</StageScope>
}

// タブに出す数（未読など。0 なら出さない）
function TabCount({ use }: { use: () => number }) {
  const n = use()
  return n > 0 ? <span className={styles.tabCount}>{n > 99 ? "99+" : n}</span> : null
}

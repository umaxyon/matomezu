// 左サイドパネルの入れ物: ステージの列の左に、窓の上から下まで出す。開いている間は、開いたステージの列を窓いっぱいに広げ（分けていれば、もう片方の幅は 0）、
// 閉じれば戻す（幅の動きは右サイドパネルと同じ。workspace/WorkspaceView.tsx）。上にタブの行と閉じるボタンを置き、
// 中身は、配置がスロットに置いたウィジェットのうち開いているタブの 1 つだけを描く。タブの名前はウィジェットの定義の leftSidePanel.title。
// 窓に 1 つだけで、ほかのステージでも開いていれば、カレントでない方を閉じる。開いたら中にフォーカスを入れ、Esc は左サイドパネルのキーの範囲で閉じる。
// 外を左ボタンで押したら閉じる（ダイアログ・メニュー・トースト・開くボタンを押したときは閉じない）。開いたステージで開いているブックが替わったときも閉じる
import { type ReactNode, useEffect, useRef } from "react"
import { useMessages, useT } from "../../../ui/i18n"
import { useMatomezuState } from "../../../ui/store-context"
import { useUiCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import type { StageSlotProps } from "../workspace/ui"
import {
  useCloseLeftSidePanel,
  useLeftSidePanelTabs,
  useOpenedLeftSidePanel,
  useSetLeftSidePanel,
  useStagesWithLeftSidePanel,
} from "./hooks"
import styles from "./LeftSidePanel.module.css"
import { LEFT_SIDE_PANEL } from "./slots"
import { leftSidePanelPressCloses } from "./state"

// 押しても左サイドパネルを閉じない所（ダイアログ・メニュー・トースト・左サイドパネルを開くボタン）
const KEEPS = "[role=dialog], [role=menu], [role=status], [role=alert], [data-left-side-panel-opener]"

export const LEFT_SIDE_PANEL_WIDTH = 320 // 開いているときの幅（px。窓より広ければ窓の幅で、ステージを覆う）

export function LeftSidePanel() {
  const t = useMessages(kit)
  const found = useOpenedLeftSidePanel()
  const tabs = useLeftSidePanelTabs()
  const opened = found && tabs.includes(found.tab) ? found : null
  const close = useCloseLeftSidePanel()
  // 窓に 1 つ: 開いているのと別のステージでも開いていれば閉じる
  const all = useStagesWithLeftSidePanel()
  useEffect(() => {
    for (const stage of all) if (stage !== found?.stage) close(stage)
  }, [all, found?.stage, close])
  const width = opened ? `min(${LEFT_SIDE_PANEL_WIDTH}px, 100vw)` : 0
  return (
    <aside
      className={styles.panel}
      style={{ width }}
      aria-hidden={!opened}
      inert={!opened}
      aria-label={t("Left side panel")}
    >
      {opened && <Opened stage={opened.stage} tab={opened.tab} tabs={tabs} width={width} />}
    </aside>
  )
}

function Opened({
  stage,
  tab,
  tabs,
  width,
}: {
  stage: string
  tab: string
  tabs: readonly string[]
  width: string | number
}) {
  const t = useMessages(kit)
  const tr = useT()
  const ref = useRef<HTMLDivElement>(null)
  const set = useSetLeftSidePanel()
  const widgets = useUiCatalog().widgets
  const book = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage)?.opened?.book ?? null)
  // 開いたら中にフォーカスを入れる（Esc を左サイドパネルのキーの範囲で受けるため）
  useEffect(() => {
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus({ preventScroll: true })
  }, [])
  // 開いたときのブックから替わったら閉じる
  const first = useRef(book)
  useEffect(() => {
    if (book !== first.current) set(stage, null)
  }, [book, stage, set])
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null
      if (!target) return
      const inside = ref.current?.contains(target) ?? false
      if (leftSidePanelPressCloses({ button: e.button, inside, kept: !!target.closest(KEEPS) })) set(stage, null)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [stage, set])
  return (
    <div ref={ref} className={styles.opened} style={{ width }} tabIndex={-1} data-key-scope={LEFT_SIDE_PANEL}>
      <div className={styles.head}>
        <div className={styles.tabs} role="tablist">
          {tabs.map(id => {
            const title = widgets.get(id)?.leftSidePanel?.title
            return (
              <button
                key={id}
                type="button"
                role="tab"
                className={styles.tab}
                aria-selected={id === tab}
                onClick={() => set(stage, id)}
              >
                {title ? tr(title) : id}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className={styles.close}
          aria-label={t("Close the left side panel")}
          onClick={() => set(stage, null)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div className={styles.body} role="tabpanel">
        <Content stage={stage} widget={tab} />
      </div>
    </div>
  )
}

// 開いているタブの中身: 配置が左サイドパネルのスロットに置いたウィジェットのうち、開いている 1 つだけを描く
function Content({ stage, widget }: { stage: string; widget: string }) {
  const View = useUiCatalog().widgets.get(widget)?.view as ((props: StageSlotProps) => ReactNode) | undefined
  return View ? <View stage={stage} /> : null
}

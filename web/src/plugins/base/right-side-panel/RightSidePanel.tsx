// 右サイドパネルの入れ物: ステージの列の右に、窓の上から下まで出す。幅は開いている中身のウィジェットの定義の rightSidePanel（無ければ既定の幅。窓より広ければ窓の幅で、ステージを覆う）で、
// 開け閉めのときは幅を動かす（動きを減らす設定では動かさない）。見出しに閉じるボタンを置き、中身は、配置がスロットに置いたウィジェットのうち開いている 1 つだけを描く。
// 窓に 1 つだけで、ほかのステージでも開いていれば、カレントでない方を閉じる。開いたら中にフォーカスを入れ、Esc は右サイドパネルのキーの範囲で閉じる。
// 外を左ボタンで押したら閉じる（ステージの道具がずらす道具のときと、ダイアログ・メニュー・トースト・ツールバーを押したときは閉じない。右ボタンはメニューと道具のアイコンを出すので閉じない）。
// 開いたステージで開いているブックかページが替わったとき、分けたり分けるのをやめたりしたときも閉じる
import { type ReactNode, useContext, useEffect, useRef } from "react"
import { toolOf } from "../../../core/workspace"
import { useMessages } from "../../../ui/i18n"
import { useLayout, useMatomezuState, useReadState } from "../../../ui/store-context"
import { useCoreCatalog, useStage, useUiCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import type { StageSlotProps } from "../workspace/ui"
import {
  PressClosedContext,
  useCloseRightSidePanel,
  useOpenedRightSidePanel,
  useStagesWithRightSidePanel,
} from "./hooks"
import styles from "./RightSidePanel.module.css"
import { RIGHT_SIDE_PANEL } from "./slots"
import { type RightSidePanelOpen, stillOn } from "./state"

const WIDTH = 480 // 中身のウィジェットが幅を書いていないときの幅（px。PC のブラウザの窓をいちばん狭くしても入る幅）

// 押しても右サイドパネルを閉じない所（ダイアログ・メニュー・トースト・道具を替えるツールバー）
const KEEPS = "[role=dialog], [role=menu], [role=status], [role=alert], [role=toolbar]"

export function RightSidePanel() {
  const t = useMessages(kit)
  // 開いている中身が、配置がスロットに置いたウィジェットでなければ開かない
  const placed: readonly string[] = useLayout().slots[RIGHT_SIDE_PANEL] ?? []
  const found = useOpenedRightSidePanel()
  const opened = found && placed.includes(found.open.widget) ? found : null
  const widget = useUiCatalog().widgets.get(opened?.open.widget ?? "")
  const width = opened ? `min(${widget?.rightSidePanel?.width ?? WIDTH}px, 100vw)` : 0
  const ref = useRef<HTMLElement>(null)
  const close = useCloseRightSidePanel()
  const read = useReadState()
  const catalog = useCoreCatalog()
  const pressClosed = useContext(PressClosedContext)
  // 窓に 1 つ: 開いているのと別のステージでも開いていれば閉じる
  const all = useStagesWithRightSidePanel()
  useEffect(() => {
    for (const stage of all) if (stage !== found?.stage) close(stage)
  }, [all, found?.stage, close])
  // 押すたびに、この押しで閉じたかを決める（外を左ボタンで押し、ずらす道具の間でなく、閉じない所でもなければ閉じる）
  const stage = opened?.stage ?? null
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      pressClosed.current = false
      const target = e.target instanceof Element ? e.target : null
      if (!stage || e.button !== 0 || !target || ref.current?.contains(target) || target.closest(KEEPS)) return
      const s = read()
      const tool = toolOf(catalog, s.workspace, stage, s.books)
      if (tool && catalog.tools.get(tool)?.pans) return
      pressClosed.current = true
      close(stage)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [stage, read, catalog, close, pressClosed])
  return (
    <aside
      ref={ref}
      className={styles.panel}
      style={{ width }}
      aria-hidden={!opened}
      inert={!opened}
      aria-label={t("Right side panel")}
    >
      {opened && (
        <Opened
          key={`${opened.stage} ${opened.open.widget} ${opened.open.subject}`}
          stage={opened.stage}
          open={opened.open}
          width={width}
        />
      )}
    </aside>
  )
}

function Opened({ stage, open, width }: { stage: string; open: RightSidePanelOpen; width: string | number }) {
  const t = useMessages(kit)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCloseRightSidePanel()
  const view = useStage(stage)
  const stages = useMatomezuState(s => s.workspace.stages.length)
  // 開いたら中にフォーカスを入れる（Esc を右サイドパネルのキーの範囲で受けるため）
  useEffect(() => ref.current?.focus({ preventScroll: true }), [])
  // 開いたときのブックかページから替わったか、ステージの数が変わったら閉じる
  const first = useRef(stages)
  const moved = !!view && !stillOn(open, view)
  useEffect(() => {
    if (moved || stages !== first.current) close(stage)
  }, [moved, stages, stage, close])
  return (
    <div ref={ref} className={styles.opened} style={{ width }} tabIndex={-1} data-key-scope={RIGHT_SIDE_PANEL}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.close}
          aria-label={t("Close the right side panel")}
          onClick={() => close(stage)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div className={styles.body}>
        <Content stage={stage} widget={open.widget} />
      </div>
    </div>
  )
}

// 開いている中身: 配置が右サイドパネルのスロットに置いたウィジェットのうち、開いている 1 つだけを描く
function Content({ stage, widget }: { stage: string; widget: string }) {
  const View = useUiCatalog().widgets.get(widget)?.view as ((props: StageSlotProps) => ReactNode) | undefined
  return View ? <View stage={stage} /> : null
}

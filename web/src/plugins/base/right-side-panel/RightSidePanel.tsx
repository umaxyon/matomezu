// 右サイドパネルの入れ物: ステージの列の右に、窓の上から下まで出す。幅は開いている中身のウィジェットの定義の rightSidePanel（無ければ既定の幅）で、
// 開け閉めのときは幅を動かす（動きを減らす設定では動かさない）。見出しに閉じるボタンを置き、中身はスロットに置いたウィジェットが描く。
// 開いたら中にフォーカスを入れ、Esc は右サイドパネルのキーの範囲で閉じる。
// 外を左ボタンで押したら閉じる（ステージの道具がずらす道具のときと、ダイアログ・メニュー・トースト・ツールバーを押したときは閉じない。右ボタンはメニューと道具のアイコンを出すので閉じない）。
// 開いたステージで開いているブックかページが替わったとき、分けたり分けるのをやめたりしたときも閉じる
import { useEffect, useRef } from "react"
import { useMessages } from "../../../ui/i18n"
import { Slot } from "../../../ui/Slot"
import { useMatomezuState } from "../../../ui/store-context"
import { useCoreCatalog, useStage, useUiCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { notePressClosed, useCloseRightSidePanel, useRightSidePanel, useRightSidePanelStage } from "./hooks"
import styles from "./RightSidePanel.module.css"
import { RIGHT_SIDE_PANEL } from "./slots"
import { stillOn } from "./state"

const WIDTH = 320 // 中身のウィジェットが幅を書いていないときの幅（px）

export function RightSidePanel() {
  const stage = useRightSidePanelStage()
  const open = useRightSidePanel(stage ?? "")
  const widget = useUiCatalog().widgets.get(open?.panel ?? "")
  const width = open ? (widget?.rightSidePanel?.width ?? WIDTH) : 0
  const t = useMessages(kit)
  return (
    <aside
      className={styles.panel}
      style={{ width }}
      aria-hidden={!open}
      inert={!open}
      aria-label={t("Right side panel")}
    >
      {stage && open && <Opened key={`${stage} ${open.panel} ${open.subject}`} stage={stage} width={width} />}
    </aside>
  )
}

function Opened({ stage, width }: { stage: string; width: number }) {
  const t = useMessages(kit)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCloseRightSidePanel()
  const view = useStage(stage)
  const open = useRightSidePanel(stage)
  const stages = useMatomezuState(s => s.workspace.stages.length)
  const catalog = useCoreCatalog()
  // 開いたら中にフォーカスを入れる（Esc を右サイドパネルのキーの範囲で受けるため）
  useEffect(() => ref.current?.focus({ preventScroll: true }), [])
  // 開いたときのブックかページから替わったか、ステージの数が変わったら閉じる
  const first = useRef(stages)
  const moved = !!open && !!view && !stillOn(open, view)
  useEffect(() => {
    if (moved || stages !== first.current) close(stage)
  }, [moved, stages, stage, close])
  // 外を左ボタンで押したら閉じる（ずらす道具の間と、ダイアログ・メニュー・トースト・ツールバーは除く）
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null
      if (e.button !== 0 || !target || ref.current?.contains(target) || target.closest(KEEPS)) return
      const tool = view?.tool
      if (tool && catalog.tools.get(tool)?.pans) return
      notePressClosed()
      close(stage)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [view?.tool, catalog, close, stage])
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
        <Slot name={RIGHT_SIDE_PANEL} props={{ stage }} />
      </div>
    </div>
  )
}

// 押しても右サイドパネルを閉じない所（ダイアログ・メニュー・トースト・道具を替えるツールバー）
const KEEPS = "[role=dialog], [role=menu], [role=status], [role=alert], [role=toolbar]"

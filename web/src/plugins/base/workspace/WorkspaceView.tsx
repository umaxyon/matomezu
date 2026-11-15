// workspace のビュー（ウィジェット workspace）: ステージの列を並べ、列ごとにステージのスロットを描く。並べ方は workspace の arrangement に従う。
// 列は、左上に浮かぶ上の行（stage-top）・ステージの本体（stage-body。左に、本体と並べる列 stage-side）・下の行（stage-bottom）と、右上に浮かぶ角（stage-corner）。何を置くかは UI マッピングが決める。
// 下の行にポインタが乗っているかを、下の行に置いたウィジェットに渡す（bottom-hover.tsx）。
// 右上の角は、ステージの中身が縦にスクロールするとき右端に出るスクロールバーに重ならないよう、スクロールバーの幅（この画面で測った値）だけ内側に浮かべる。
// 分けているときは、カレントのステージの下の行の色を少し変えて示す。左の列の幅を arrangement の share の割合にし、列の境目をドラッグすると share が変わる（ダブルクリックで真ん中に戻る）。
// ドラッグでは、並べた枠の左からポインタまでの長さと枠の幅をそのまま store に渡す（境目の部品は SplitHandle。割合の計算と収め方は workspace の側）。
// 列の右に右サイドパネルを置く。開いている間は、開いたステージの列を広げ、もう片方の列の幅を 0 にする（share は変えないので、閉じれば元の割合に戻る）。
// 左サイドパネルは窓の左（window/WindowView.tsx）にあり、開けばこの画面ごと押し縮める。
// 開いた物を見せ、閉じたら見え方を戻すのは、幅を動かし終えてから（RevealAndRestore）
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { previewing } from "../../../core/stage"
import { screenOf, stageIn } from "../../../core/window"
import type { MatomezuState } from "../../../store/store"
import { Slot } from "../../../ui/Slot"
import { StageScope } from "../../../ui/scope"
import { useScreenHere } from "../../../ui/screen-context"
import { useMatomezuState, useStoreActions } from "../../../ui/store-context"
import { PressClosedContext, useOpenedRightSidePanel, useSidePanelSliding } from "../right-side-panel/hooks"
import { RevealAndRestore } from "../right-side-panel/RevealAndRestore"
import { RightSidePanel } from "../right-side-panel/RightSidePanel"
import { columnGrow } from "../right-side-panel/state"
import footerRow from "../utils/FooterRow.module.css"
import { SplitHandle } from "../utils/SplitHandle"
import { SLIDE_MS } from "../window/slide"
import { BottomHoverContext } from "./bottom-hover"
import { STAGE_BODY, STAGE_BOTTOM, STAGE_CORNER, STAGE_SIDE, STAGE_TOP } from "./slots"
import styles from "./WorkspaceView.module.css"

export function WorkspaceView() {
  // 描いている場所のブックスクリーンの中（スクリーンの外で描いたときは、いちばん最近前に出したブックスクリーンの中）
  const here = useScreenHere()?.id
  const mine = (s: MatomezuState) => s.window.screens.find(x => x.id === here)?.stages ?? screenOf(s.window)
  const ids = useMatomezuState(useShallow(s => mine(s).stages.map(st => st.id)))
  const direction = useMatomezuState(s => mine(s).arrangement.direction)
  const share = useMatomezuState(s => mine(s).arrangement.share)
  const current = useMatomezuState(s => mine(s).current)
  const { moveDivider, evenDivider } = useStoreActions()
  const ref = useRef<HTMLElement>(null)
  const [scrollbar, setScrollbar] = useState(0)
  useLayoutEffect(() => setScrollbar(scrollbarWidth()), [])
  const split = ids.length === 2
  const right = useOpenedRightSidePanel()?.stage ?? null
  // 広げるステージ: 右サイドパネルを開いたステージ
  const panel = right
  const sliding = useSidePanelSliding(panel)
  const pressClosed = useRef(false)
  return (
    <main
      ref={ref}
      className={`${styles.workspace} ${styles[direction] ?? ""} ${sliding ? styles.sliding : ""}`}
      style={
        {
          ["--scrollbar-w" as string]: `${scrollbar}px`,
          ["--side-panel-slide" as string]: `${SLIDE_MS}ms`,
        } as CSSProperties
      }
    >
      <PressClosedContext.Provider value={pressClosed}>
        {ids.map((stage, i) => (
          <div
            key={stage}
            className={styles.column}
            data-current={split && stage === current}
            data-hidden={panel !== null && stage !== panel}
            inert={panel !== null && stage !== panel}
            style={split ? { flexGrow: columnGrow(stage, i, panel, share) } : undefined}
          >
            {i === 1 && panel === null && (
              <SplitHandle
                direction="row"
                frame={ref}
                onMove={moveDivider}
                onReset={() => evenDivider()}
                className={styles.divider}
                data-divider
              />
            )}
            <StageColumn stage={stage} />
          </div>
        ))}
        <RightSidePanel />
        <RevealAndRestore sliding={sliding} />
      </PressClosedContext.Provider>
    </main>
  )
}

// この画面で、縦のスクロールバーが取る幅（px。幅を取らずに重ねて出す環境では 0）
function scrollbarWidth(): number {
  const probe = document.createElement("div")
  probe.style.cssText = "position:absolute;top:-200px;width:100px;height:100px;overflow:scroll"
  document.body.append(probe)
  const width = probe.offsetWidth - probe.clientWidth
  probe.remove()
  return width
}

// ステージの列の中身。中の物の描いている場所を、そのステージにする（ui/scope.tsx）。
// 印刷プレビューの間は、ステージの中身のほか（上・下の行と角）を出さない（中身の操作の道具を出さないため）
function StageColumn({ stage }: { stage: string }) {
  const inPreview = useMatomezuState(s => {
    const st = stageIn(s.window, stage)
    return !!st && previewing(st)
  })
  return (
    <StageScope stage={stage}>
      {!inPreview && (
        <div className={styles.top}>
          <Slot name={STAGE_TOP} props={{}} />
        </div>
      )}
      <div className={styles.body}>
        {!inPreview && (
          <div className={styles.side}>
            <Slot name={STAGE_SIDE} props={{}} />
          </div>
        )}
        <div className={styles.cell}>
          <Slot name={STAGE_BODY} props={{}} />
        </div>
      </div>
      {!inPreview && <Bottom />}
      {!inPreview && (
        <div className={styles.corner}>
          <Slot name={STAGE_CORNER} props={{}} />
        </div>
      )}
    </StageScope>
  )
}

// 下の行。ポインタが乗っているかを中のウィジェットに渡す
function Bottom() {
  const [hover, setHover] = useState(0)
  return (
    <div
      className={`${footerRow.row} ${styles.bottom}`}
      onPointerOver={() => setHover(n => n + 1)}
      onPointerLeave={() => setHover(0)}
    >
      <BottomHoverContext.Provider value={hover}>
        <Slot name={STAGE_BOTTOM} props={{}} />
      </BottomHoverContext.Provider>
    </div>
  )
}

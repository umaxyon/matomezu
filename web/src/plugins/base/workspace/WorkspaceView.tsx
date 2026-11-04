// workspace のビュー（ウィジェット workspace）: ステージの列を並べ、列ごとにステージのスロットを描く。並べ方は workspace の arrangement に従う。
// 列は、左上に浮かぶ上の行（stage-top）・ステージの本体（stage-body）・下の行（stage-bottom）と、右上に浮かぶ角（stage-corner）。何を置くかは配置が決める。
// 下の行にポインタが乗っているかを、下の行に置いたウィジェットに渡す（bottom-hover.tsx）。
// 右上の角は、ステージの中身が縦にスクロールするとき右端に出るスクロールバーに重ならないよう、スクロールバーの幅（この画面で測った値）だけ内側に浮かべる。
// 分けているときは、カレントのステージの下の行の色を少し変えて示す。左の列の幅を arrangement の share の割合にし、列の境目をドラッグすると share が変わる（ダブルクリックで真ん中に戻る）。
// ドラッグでは、並べた枠の左からポインタまでの長さと枠の幅をそのまま store に渡す（割合の計算と収め方は workspace の側）。
// 列の右に右サイドパネルを置く。開いている間は、開いたステージの列を広げ、もう片方の列の幅を 0 にする（share は変えないので、閉じれば元の割合に戻る）。
// 開いた物を見せ、閉じたら見え方を戻すのは、幅を動かし終えてから（RevealAndRestore）
import { type CSSProperties, type PointerEvent, useLayoutEffect, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { previewing } from "../../../core/stage"
import { Slot } from "../../../ui/Slot"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import {
  PressClosedContext,
  SLIDE_MS,
  useOpenedRightSidePanel,
  useRightSidePanelSliding,
} from "../right-side-panel/hooks"
import { RevealAndRestore } from "../right-side-panel/RevealAndRestore"
import { RightSidePanel } from "../right-side-panel/RightSidePanel"
import { columnGrow } from "../right-side-panel/state"
import { BottomHoverContext } from "./bottom-hover"
import { STAGE_BODY, STAGE_BOTTOM, STAGE_CORNER, STAGE_TOP } from "./slots"
import styles from "./WorkspaceView.module.css"

export function WorkspaceView() {
  const ids = useMatomezuState(useShallow(s => s.workspace.stages.map(st => st.id)))
  const direction = useMatomezuState(s => s.workspace.arrangement.direction)
  const share = useMatomezuState(s => s.workspace.arrangement.share)
  const current = useMatomezuState(s => s.workspace.current)
  const { moveDivider, evenDivider } = useActions()
  const ref = useRef<HTMLElement>(null)
  const [scrollbar, setScrollbar] = useState(0)
  useLayoutEffect(() => setScrollbar(scrollbarWidth()), [])
  const split = ids.length === 2
  const panel = useOpenedRightSidePanel()?.stage ?? null
  const sliding = useRightSidePanelSliding(panel)
  const pressClosed = useRef(false)
  const drag = (e: PointerEvent<HTMLElement>) => {
    if (e.type === "pointerdown") {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const box = ref.current?.getBoundingClientRect()
    if (box) moveDivider(e.clientX - box.left, box.width)
  }
  return (
    <main
      ref={ref}
      className={`${styles.workspace} ${styles[direction] ?? ""} ${sliding ? styles.sliding : ""}`}
      style={
        {
          ["--scrollbar-w" as string]: `${scrollbar}px`,
          ["--right-side-panel-slide" as string]: `${SLIDE_MS}ms`,
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
              // biome-ignore lint/a11y/noStaticElementInteractions: 境目はポインタで動かす（キーの操作は持たない）
              <div
                className={styles.divider}
                data-divider
                onPointerDown={drag}
                onPointerMove={drag}
                onDoubleClick={() => evenDivider()}
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

// ステージの列の中身。印刷プレビューの間は、ステージの中身のほか（上・下の行と角）を出さない（中身の操作の道具を出さないため）
function StageColumn({ stage }: { stage: string }) {
  const inPreview = useMatomezuState(s => {
    const st = s.workspace.stages.find(st => st.id === stage)
    return !!st && previewing(st)
  })
  return (
    <>
      {!inPreview && (
        <div className={styles.top}>
          <Slot name={STAGE_TOP} props={{ stage }} />
        </div>
      )}
      <div className={styles.cell}>
        <Slot name={STAGE_BODY} props={{ stage }} />
      </div>
      {!inPreview && <Bottom stage={stage} />}
      {!inPreview && (
        <div className={styles.corner}>
          <Slot name={STAGE_CORNER} props={{ stage }} />
        </div>
      )}
    </>
  )
}

// 下の行。ポインタが乗っているかを中のウィジェットに渡す
function Bottom({ stage }: { stage: string }) {
  const [hover, setHover] = useState(0)
  return (
    <div className={styles.bottom} onPointerOver={() => setHover(n => n + 1)} onPointerLeave={() => setHover(0)}>
      <BottomHoverContext.Provider value={hover}>
        <Slot name={STAGE_BOTTOM} props={{ stage }} />
      </BottomHoverContext.Provider>
    </div>
  )
}

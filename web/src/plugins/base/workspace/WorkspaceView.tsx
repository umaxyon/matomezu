// workspace のビュー（ウィジェット workspace）: ステージの列を並べ、列ごとにステージのスロットを描く。並べ方は workspace の arrangement に従う。
// 列は、上の行（stage.top）・ステージの本体（stage.body）・下の行（stage.bottom）と、右上に浮かぶ角（stage.corner）。何を置くかは配置が決める。
// 上の行・下の行・角の右クリックでは、ブラウザのメニューを出さない（文字の入力欄の中は除く）。
// 分けているときは、カレントのステージの下の行の色を少し変えて示す。左の列の幅を arrangement の share の割合にし、列の境目をドラッグすると share が変わる（ダブルクリックで真ん中に戻る）。
// ドラッグでは、並べた枠の左からポインタまでの長さと枠の幅をそのまま store に渡す（割合の計算と収め方は workspace の側）
import { type MouseEvent, type PointerEvent, useRef } from "react"
import { useShallow } from "zustand/react/shallow"
import { Slot } from "../../../ui/Slot"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import styles from "./WorkspaceView.module.css"

const noBrowserMenu = (e: MouseEvent) => {
  if (!(e.target instanceof Element && e.target.closest("input, textarea, [contenteditable]"))) e.preventDefault()
}

export function WorkspaceView() {
  const ids = useMatomezuState(useShallow(s => s.workspace.stages.map(st => st.id)))
  const direction = useMatomezuState(s => s.workspace.arrangement.direction)
  const share = useMatomezuState(s => s.workspace.arrangement.share)
  const current = useMatomezuState(s => s.workspace.current)
  const { moveDivider, evenDivider } = useActions()
  const ref = useRef<HTMLElement>(null)
  const split = ids.length === 2
  const drag = (e: PointerEvent<HTMLElement>) => {
    if (e.type === "pointerdown") {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const box = ref.current?.getBoundingClientRect()
    if (box) moveDivider(e.clientX - box.left, box.width)
  }
  return (
    <main ref={ref} className={`${styles.workspace} ${styles[direction] ?? ""}`}>
      {ids.map((stage, i) => (
        <div
          key={stage}
          className={styles.column}
          data-current={split && stage === current}
          style={split ? { flexGrow: i === 0 ? share : 1 - share } : undefined}
        >
          {i === 1 && (
            // biome-ignore lint/a11y/noStaticElementInteractions: 境目はポインタで動かす（キーの操作は持たない）
            <div
              className={styles.divider}
              data-divider
              onPointerDown={drag}
              onPointerMove={drag}
              onDoubleClick={() => evenDivider()}
            />
          )}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: ブラウザのメニューを止めるだけで、操作は持たない */}
          <div className={styles.top} onContextMenu={noBrowserMenu}>
            <Slot name="stage.top" props={{ stage }} />
          </div>
          <div className={styles.cell}>
            <Slot name="stage.body" props={{ stage }} />
          </div>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: ブラウザのメニューを止めるだけで、操作は持たない */}
          <div className={styles.bottom} onContextMenu={noBrowserMenu}>
            <Slot name="stage.bottom" props={{ stage }} />
          </div>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: ブラウザのメニューを止めるだけで、操作は持たない */}
          <div className={styles.corner} onContextMenu={noBrowserMenu}>
            <Slot name="stage.corner" props={{ stage }} />
          </div>
        </div>
      ))}
    </main>
  )
}

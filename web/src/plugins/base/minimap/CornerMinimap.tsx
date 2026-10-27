// ステージの左下のミニマップ（ウィジェット minimap）: コマンド minimap-toggle で開いている間、ステージの左下に浮かべておく。
// ポインタが一度近づいたあと、枠から離れたら閉じる（右の長押しで出すミニマップと同じ距離。ボタンを押している間は閉じない）
import { useEffect, useRef } from "react"
import { useActions, useMatomezuState } from "../../../ui/store-context"
import { farFrom } from "../tool-picker/layout"
import styles from "./CornerMinimap.module.css"
import { MinimapView } from "./MinimapView"

export const CORNER_SIZE = { w: 180, h: 140 } // 紙を収める大きさ（px）

export function CornerMinimap({ stage }: { stage: string }) {
  const open = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage)?.minimap === true)
  const { setMinimap } = useActions()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    let near = false // 近づいたか（開いたときに離れた所にあったポインタでは閉じない）
    const onMove = (e: PointerEvent) => {
      const el = box.current
      if (e.buttons !== 0 || !el) return
      const r = el.getBoundingClientRect()
      const far = farFrom({ x: r.left, y: r.top, w: r.width, h: r.height }, { x: e.clientX, y: e.clientY })
      if (!far) near = true
      else if (near) setMinimap(stage, false)
    }
    window.addEventListener("pointermove", onMove)
    return () => window.removeEventListener("pointermove", onMove)
  }, [open, stage, setMinimap])

  if (!open) return null
  return (
    <div ref={box} className={styles.corner} data-minimap="corner">
      <MinimapView stage={stage} width={CORNER_SIZE.w} height={CORNER_SIZE.h} />
    </div>
  )
}

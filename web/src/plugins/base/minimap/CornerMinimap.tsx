// ステージの左下のミニマップ（ウィジェット minimap）: コマンド minimap-toggle で開いている間、ステージの左下に浮かべておく
import { useMatomezuState } from "../../../ui/store-context"
import styles from "./CornerMinimap.module.css"
import { MinimapView } from "./MinimapView"

export const CORNER_SIZE = { w: 180, h: 140 } // 紙を収める大きさ（px）

export function CornerMinimap({ stage }: { stage: string }) {
  const open = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage)?.minimap === true)
  if (!open) return null
  return (
    <div className={styles.corner} data-minimap="corner">
      <MinimapView stage={stage} width={CORNER_SIZE.w} height={CORNER_SIZE.h} />
    </div>
  )
}

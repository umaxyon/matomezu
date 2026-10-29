// ドロワーの地図（ウィジェット drawer-minimap）: 拡大縮小の帯（base/zoom の ZoomBar）を左に寄せて置き、その真上に、ミニマップ（base/minimap の MinimapView）の台を
// 帯の左端にそろえて、行にぴったり付けて載せる（台は帯より広く、右隣のスロットの上にかかってよい）。紙の無いステージでは描かない
import type { CSSProperties } from "react"
import { paperOf } from "../../../core/stage"
import { useMatomezuState } from "../../../ui/store-context"
import { MinimapView } from "../minimap/MinimapView"
import { ZoomBar } from "../zoom/ZoomBar"
import styles from "./DrawerMinimap.module.css"

// ミニマップの絵の枠（px）。紙の形によらずこの大きさで、紙は縦長でも横長でもこの中に収めて真ん中に描く
const MAP = { w: 156, h: 110 }

export function DrawerMinimap({ stage }: { stage: string }) {
  const hasPaper = useMatomezuState(s => {
    const st = s.workspace.stages.find(x => x.id === stage)
    return st !== undefined && paperOf(st) !== null
  })
  if (!hasPaper) return null
  const size = { ["--map-w" as string]: `${MAP.w}px`, ["--map-h" as string]: `${MAP.h}px` } as CSSProperties
  return (
    <div className={styles.cell} style={size}>
      <div className={styles.map} data-minimap="drawer">
        <MinimapView stage={stage} width={MAP.w} height={MAP.h} className={styles.mapView} />
      </div>
      <ZoomBar stage={stage} className={styles.zoomBar} />
    </div>
  )
}

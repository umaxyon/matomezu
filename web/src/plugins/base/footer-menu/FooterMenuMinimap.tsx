// フッタメニューの地図（ウィジェット footer-menu-minimap）: 拡大縮小の帯（base/zoom の ZoomBar）を左に寄せて置き、その真上に、ミニマップ（base/minimap の MinimapView）の台を
// 帯の左端にそろえて、行にぴったり付けて載せる（台は帯より広く、右隣のスロットの上にかかってよい）。紙の無いステージでは描かない
import type { CSSProperties } from "react"
import { NO_PAPER, paperOf } from "../../../core/stage"
import { useStageHere } from "../../../ui/scope"
import { MINIMAP_SIZE as MAP } from "../minimap/geometry"
import { MinimapView } from "../minimap/MinimapView"
import { ZoomBar } from "../zoom/ZoomBar"
import styles from "./FooterMenuMinimap.module.css"

export function FooterMenuMinimap() {
  const hasPaper = useStageHere(st => st !== null && paperOf(st) !== NO_PAPER)
  if (!hasPaper) return null
  const size = { ["--map-w" as string]: `${MAP.w}px`, ["--map-h" as string]: `${MAP.h}px` } as CSSProperties
  return (
    <div className={styles.cell} style={size}>
      <div className={styles.map} data-minimap="footer-menu">
        <MinimapView width={MAP.w} height={MAP.h} className={styles.mapView} />
      </div>
      <ZoomBar className={styles.zoomBar} />
    </div>
  )
}

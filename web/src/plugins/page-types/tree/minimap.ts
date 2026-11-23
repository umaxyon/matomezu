// ツリーのページのミニマップの絵: 木を並べ（layout.ts）、親から子への線を両端を結ぶ線で、節を四角で描く（紙の座標。根の無いページは描かない）
import type { CoreCatalog, ItemPage } from "../../../plugin-api"
import type { GrowSides, MinimapMark, NO_GROW, SettingReader } from "../../base"
import { laidPage } from "./print"

// プレゼンテーションの minimap。setting は、そのページで効いている設定の値を読む関数。grow はページの増やす向き（可変ページでなければ NO_GROW）
export function treeMinimap(
  catalog: CoreCatalog,
  page: ItemPage,
  on: { setting: SettingReader; grow: GrowSides | typeof NO_GROW },
): MinimapMark[] {
  const laid = laidPage(catalog, page, on)
  if (!laid) return []
  return [
    ...laid.lines.map((l): MinimapMark => ({ kind: "polyline", points: [l.from, l.to] })),
    ...laid.nodes.map((n): MinimapMark => ({ kind: "rect", x: n.x, y: n.y, w: n.w, h: n.h, rx: 2 })),
  ]
}

// 画面に描いた物を、紙の上の四角で測る（右サイドパネルで開いた物と、伝言一覧で押した物を見せるのに使う）
import type { Rect } from "../../../core/geom"
import type { Stage } from "../../../core/stage"
import { anchorElementIn, revealedRect } from "../utils/anchors"
import { stageElement } from "../utils/stage-element"
import { paperRectOf } from "./reveal"

// ステージ stage の、アンカー ids の物をまとめて囲む四角（紙の上で。どれも描かれていなければ null）。先に、物を囲む Revealable に見えるようにと頼む（リストの中のスクロールなど）
export function anchorsRect(stage: string, ids: readonly string[], now: Stage): Rect | null {
  const view = stageElement(stage)
  if (!view) return null
  const found = ids.flatMap(id => {
    const el = anchorElementIn(stage, id)?.el
    return el ? [{ el, id }] : []
  })
  const rect = revealedRect(view, view, found)
  return rect && paperRectOf(now, rect)
}

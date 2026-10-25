// 形を並べるビュー（紙など）と、つなぐもの（線など）のビューの間の口。
// 形を並べるビューは、ブックで使えるつなぐもののビュー（ConnectorUi）の layer で形の並びを包み、形 1 つごとに overlay を重ねる。
// 渡すのは今の形の様子（ShapeScene）だけで、つなぐものの状態（引いている途中など）はつなぐもののビューが持つ。
// つなぐもののビューは、形に求める見た目（ShapeMarks）を ShapeMarksContext で返す。
// 形の要素は data-shape と data-item（形の id）を持つ（つなぐもののビューは、ポインタの下の形をこれで探す）
import { type ComponentType, createContext, type PointerEvent, type ReactNode, useContext } from "react"
import type { ContextMenuId } from "../core/catalog"
import type { Point, Rect } from "../core/geom"
import type { ItemPage } from "../core/placed"
import type { Stage } from "../core/stage"

export interface ShapeScene {
  stage: Stage
  page: ItemPage
  rects: ReadonlyMap<string, Rect> // 描いている形の四角（下書き・大きさを変えている途中・ドラッグでずらした所を重ねたもの）
  dragged: readonly string[] // ドラッグで動かしている形
  pushed: readonly string[] // ドラッグの入れ替えでずれて描いている形
  swapped: boolean // このドラッグで入れ替えが起きたか
  settled: ReadonlySet<string> // 離したばかりの形（離したあとの 1 回の描画だけ）
  busy: boolean // 形を動かしているか、大きさを変えている間
  selectable: boolean // 選択の道具で、置こうとしていないとき
  hover: string | null // ポインタを乗せている形
  localOf(e: PointerEvent<Element>): Point | null // ポインタの位置を、ビューの左上から見た位置にする
}

// つなぐもののビューが形に求める見た目: keep にない形を薄くする（null ならだれも薄くしない）、target を相手として強調する
export interface ShapeMarks {
  keep: ReadonlySet<string> | null
  target: string | null
}

export const ShapeMarksContext = createContext<ShapeMarks>({ keep: null, target: null })
export const useShapeMarks = (): ShapeMarks => useContext(ShapeMarksContext)

export interface ConnectorUi {
  // ページのつなぐものを描く層。形の並び（children）を包み、overlay と同じ状態を持てる
  layer: ComponentType<{ scene: ShapeScene; children: ReactNode }>
  // 形 1 つの上に重ねるコンポーネント（線を引く〇など）
  overlay?: ComponentType<{ scene: ShapeScene; id: string }>
  contextMenus?: readonly ContextMenuId[] // 層が開く右クリックのメニュー
}

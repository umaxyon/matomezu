// 図面のブックのビュー: ページごとの紙と、その上の箱とリストを描く。画面の上の右クリックで図面のメニュー（drawing.context）、アイテムの上で box.context、
// リストの行の上で row.context を開く（行のメニューは、ビューの中に描くリストのビューが開く）
import type { BookViewDef } from "../../../../ui/plugin"
import { DrawingView } from "./DrawingView"

export const DRAWING_VIEW = {
  view: DrawingView,
  contextMenus: ["drawing.context", "box.context", "row.context"],
} as const satisfies BookViewDef

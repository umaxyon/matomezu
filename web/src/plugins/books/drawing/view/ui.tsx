// 図面のブックのビュー: ページごとの紙と、その上の箱を描く。画面の上の右クリックで図面のメニュー（drawing.context）、アイテムの上で box.context を開く
import type { BookViewDef } from "../../../../ui/plugin"
import { DrawingView } from "./DrawingView"

export const DRAWING_VIEW = {
  view: DrawingView,
  contextMenus: ["drawing.context", "box.context"],
} as const satisfies BookViewDef

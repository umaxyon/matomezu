// 図面のブックのビュー: ページごとの紙と、その上の箱を描く。画面の上の右クリックで、図面のメニュー（drawing.context）を開く
import type { BookViewDef } from "../../../../ui/plugin"
import { DrawingView } from "./DrawingView"

export const DRAWING_VIEW = { view: DrawingView, contextMenus: ["drawing.context"] } as const satisfies BookViewDef

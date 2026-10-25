// 紙のビュー: ページごとの紙と、その上の形を描く。画面の上の右クリックで紙のメニュー（paper.context）、形の上で item.context を開く
// （線のメニューは線の層が、行のメニューはリストのビューが開く）
import type { BookViewDef } from "../../../plugin-api/ui"
import { PaperView } from "./PaperView"

export const PAPER_VIEW = {
  view: PaperView,
  contextMenus: ["paper.context", "item.context"],
} as const satisfies BookViewDef

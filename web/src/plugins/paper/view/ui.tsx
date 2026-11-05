// 紙のビュー: ページごとの紙と、その上の形を描く。印刷プレビューと印刷では、紙 1 枚ずつを PaperSheet が描く。画面の上の右クリックで紙のメニュー（paper-context）、形の上で item-context を開く
// （線のメニューはラインビューが、行のメニューはリストのビューが開く）
import type { BookViewDef } from "../../../plugin-api/ui"
import { ITEM_CONTEXT, PAPER_CONTEXT } from "../paper"
import { PaperSheet } from "./PaperSheet"
import { PaperView } from "./PaperView"

export const PAPER_VIEW = {
  view: PaperView,
  printSheet: PaperSheet,
  contextMenus: [PAPER_CONTEXT, ITEM_CONTEXT],
} as const satisfies BookViewDef

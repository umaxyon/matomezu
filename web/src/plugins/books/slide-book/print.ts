// スライドのページの印刷とミニマップ: 紙は 1 枚で（増えない）、スライドのアイテムが 1 つでも紙に掛かれば、その 1 枚を載っているとする（見せ方の printSheets）。
// 紙の外にはみ出た所は切れて刷る
import { type CoreCatalog, type ItemPage, type Rect, slideOf } from "../../../plugin-api"
import { type MinimapMark, type PrintSheets, paperSize, printSheetsOf } from "../../base"

export function slidePrintSheets(catalog: CoreCatalog, page: ItemPage): PrintSheets {
  const paper = paperSize(catalog, page)
  if (!paper) return { columns: 1, rows: 1, filled: new Set() }
  const rects: Rect[] = slideOf(page).map(s => ({ x: s.x, y: s.y, w: s.w ?? 0, h: s.h ?? 0 }))
  return printSheetsOf(paper, rects, undefined, null)
}

// ミニマップの絵: スライドのアイテムの枠を四角で描く（見せ方の minimap）
export const slideMinimapMarks = (_catalog: CoreCatalog, page: ItemPage): readonly MinimapMark[] =>
  slideOf(page).map(s => ({ kind: "rect", x: s.x, y: s.y, w: s.w ?? 0, h: s.h ?? 0 }))

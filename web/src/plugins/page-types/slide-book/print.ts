// スライドのページの印刷区画: 紙は 1 枚で（増えない）、スライドのアイテムが 1 つでも紙に掛かれば、その 1 枚を載っているとする（プレゼンテーションの printSheets。設定 slide-print が always なら何も無くても載り、never なら載らない）。
// 紙の外にはみ出た所は切れて刷る（ミニマップは base の置いたアイテムの絵）
import { type CoreCatalog, type ItemPage, type Rect, slideOf } from "../../../plugin-api"
import { type PrintSheets, paperSize, printSheetsOf, type SettingReader } from "../../base"
import { SLIDE_PRINT } from "./print-setting"

export function slidePrintSheets(catalog: CoreCatalog, page: ItemPage, on: { setting: SettingReader }): PrintSheets {
  const paper = paperSize(catalog, page)
  const mode = on.setting(SLIDE_PRINT)
  if (!paper || mode === "never") return { columns: 1, rows: 1, filled: new Set() }
  if (mode === "always") return printSheetsOf(paper, [{ x: 0, y: 0, w: paper.w, h: paper.h }], undefined, null)
  const rects: Rect[] = slideOf(page).map(s => ({ x: s.x, y: s.y, w: s.w ?? 0, h: s.h ?? 0 }))
  return printSheetsOf(paper, rects, undefined, null)
}

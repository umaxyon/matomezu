// 印刷プレビューの見せ方の設定の項目（ステージエントリが持つ設定の項目で printPreview を書く。変えるのは print-preview-update だけ）:
// 印刷区画を並べる向き・可変ページの印刷区画を数える順・紙に印刷区画の番号とブック名（バインダ名）とページ名を入れるか
import { z } from "zod"
import type { CatalogCheckDef } from "../../../core/core-catalog"
import { problem } from "../../../core/errors"
import { kit } from "../kit"

declare module "../../../core/catalog" {
  interface SettingExtras {
    printPreview?: true // 印刷プレビューの設定の項目（ステージエントリが持つ項目だけが書く）。印刷プレビューの右サイドパネルに並べ、print-preview-update が変える（book-update と設定のダイアログには出さない）
  }
}

// printPreview はステージエントリが持つ設定の項目だけが書く（ページの項目・利用者の設定の項目には書けない。台帳アセンブルのときの確かめ）
export const PRINT_PREVIEW_SETTING_CHECK: CatalogCheckDef = catalog =>
  [...catalog.settings.values(), ...catalog.userSettings.values()]
    .filter(d => d.printPreview && d.holder !== "outermost")
    .map(d => problem("E129", { id: d.id }))

// 印刷区画を並べる向き: column は上から下へ、row は左から右へ
export const SheetFlowSchema = z.enum(["column", "row"]).describe("column: top to bottom; row: left to right")
export type SheetFlow = z.infer<typeof SheetFlowSchema>

// 可変ページの印刷区画を数える順: across は左から右へ進んでから次の段へ、down は上から下へ進んでから次の列へ
export const SheetOrderSchema = z
  .enum(["across", "down"])
  .describe(
    "the order of a variable page's print areas. across: left to right, then the next row; down: top to bottom, then the next column",
  )
export type SheetOrder = z.infer<typeof SheetOrderSchema>

// 紙に入れるか
export const ShownSchema = z
  .enum(["shown", "hidden"])
  .describe('on each sheet (with both the book name and the page name, "book - page" at the top left)')

export const PRINT_PREVIEW_FLOW = kit.defineSetting({
  id: "print-preview-flow",
  holder: "outermost",
  printPreview: true,
  title: "Arrange sheets",
  schema: SheetFlowSchema,
  default: "column",
})

export const PRINT_PREVIEW_ORDER = kit.defineSetting({
  id: "print-preview-order",
  holder: "outermost",
  printPreview: true,
  title: "Order of print areas",
  schema: SheetOrderSchema,
  default: "across",
})

export const PRINT_PREVIEW_SHEET_NUMBERS = kit.defineSetting({
  id: "print-preview-sheet-numbers",
  holder: "outermost",
  printPreview: true,
  title: "Print page numbers",
  schema: ShownSchema,
  default: "hidden",
})

export const PRINT_PREVIEW_BOOK_NAME = kit.defineSetting({
  id: "print-preview-book-name",
  holder: "outermost",
  printPreview: true,
  title: "Print the book name",
  schema: ShownSchema,
  default: "hidden",
})

export const PRINT_PREVIEW_PAGE_NAME = kit.defineSetting({
  id: "print-preview-page-name",
  holder: "outermost",
  printPreview: true,
  title: "Print the page name",
  schema: ShownSchema,
  default: "hidden",
})

// 背景（ページの slide。背景を持つタイプのページ）を印刷に出すか（ページの設定の項目）。
// auto は、中身の載った印刷区画にだけ背景を敷き（背景だけの印刷区画は並べない）、always は中身が無くてもそのページの全部の印刷区画に出し、never は背景を出さない
export const BackgroundPrintSchema = z.enum(["auto", "always", "never"])
export type BackgroundPrint = z.infer<typeof BackgroundPrintSchema>

export const BACKGROUND_PRINT = kit.defineSetting({
  id: "background-print",
  holder: "page",
  title: "Print background",
  schema: BackgroundPrintSchema,
  default: "auto",
})

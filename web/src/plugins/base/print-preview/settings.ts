// 印刷プレビューの見せ方の設定の項目（ブックの設定。ページを持つタイプが settings.book に選ぶ。変えるのは print-preview-update だけ）:
// 印刷区画を並べる向き・可変ページの印刷区画を数える順・紙に印刷区画の番号とブック名とページ名を入れるか
import { z } from "zod"
import { kit } from "../kit"

// 印刷区画を並べる向き: column は上から下へ、row は左から右へ
export const SheetFlowSchema = z.enum(["column", "row"])
export type SheetFlow = z.infer<typeof SheetFlowSchema>

// 可変ページの印刷区画を数える順: across は左から右へ進んでから次の段へ、down は上から下へ進んでから次の列へ
export const SheetOrderSchema = z.enum(["across", "down"])
export type SheetOrder = z.infer<typeof SheetOrderSchema>

// 紙に入れるか
export const ShownSchema = z.enum(["shown", "hidden"])

export const PRINT_PREVIEW_FLOW = kit.defineSetting({
  id: "print-preview-flow",
  title: "Arrange sheets",
  schema: SheetFlowSchema,
  default: "column",
})

export const PRINT_PREVIEW_ORDER = kit.defineSetting({
  id: "print-preview-order",
  title: "Order of print areas",
  schema: SheetOrderSchema,
  default: "across",
})

export const PRINT_PREVIEW_SHEET_NUMBERS = kit.defineSetting({
  id: "print-preview-sheet-numbers",
  title: "Print page numbers",
  schema: ShownSchema,
  default: "hidden",
})

export const PRINT_PREVIEW_BOOK_NAME = kit.defineSetting({
  id: "print-preview-book-name",
  title: "Print the book name",
  schema: ShownSchema,
  default: "hidden",
})

export const PRINT_PREVIEW_PAGE_NAME = kit.defineSetting({
  id: "print-preview-page-name",
  title: "Print the page name",
  schema: ShownSchema,
  default: "hidden",
})

// 印刷プレビューの設定の項目の id（ページを持つタイプが settings.book に並べる）
export const PRINT_PREVIEW_SETTINGS = [
  PRINT_PREVIEW_FLOW.id,
  PRINT_PREVIEW_ORDER.id,
  PRINT_PREVIEW_SHEET_NUMBERS.id,
  PRINT_PREVIEW_BOOK_NAME.id,
  PRINT_PREVIEW_PAGE_NAME.id,
] as const

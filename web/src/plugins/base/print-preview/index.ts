// 印刷プレビュー: ステージで開いたブックの全ページの印刷区画を並べて、見るだけで見せる（ステージの見え方は core/stage.ts の StageMode）。
// 開くのはフッタメニューのボタン（コマンド print-preview-open）。開くと右サイドパネルに印刷プレビューの設定を出し、右サイドパネルを閉じれば印刷プレビューも閉じる
// （閉じたときに戻す見え方は、ステージの印刷プレビューが持つ。右サイドパネルの戻しは使わない）。
// 設定（settings.ts）を変えるのはアクション print-preview-update だけで、印刷プレビューの間も行え、画面の履歴（Undo）には入れない
import { z } from "zod"
import { hasPages } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { ItemPage } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import type { CommandActions, CommandContext } from "../../../store/commands/def"
import { workspaceOf } from "../../../store/commands/def"
import { withBookSettings } from "../book-look"
import { type SettingReader, settingValue } from "../book-settings"
import { kit } from "../kit"
import type { GrowSides } from "../place/grow"
import { withOpened } from "../right-side-panel/state"
import { fitSideView, moveView, stageOf } from "../zoom"
import { hasCrossing } from "./book-sheets"
import { printCheckOpen } from "./panel-id"
import { printReadyOf } from "./print-state"
import {
  PRINT_PREVIEW_BOOK_NAME,
  PRINT_PREVIEW_FLOW,
  PRINT_PREVIEW_ORDER,
  PRINT_PREVIEW_PAGE_NAME,
  PRINT_PREVIEW_SHEET_NUMBERS,
  SheetFlowSchema,
  SheetOrderSchema,
  ShownSchema,
} from "./settings"

// 印刷区画を数える物: print は印刷プレビューと印刷に並べる並べ方、screen は書く画面の並べ方
export type SheetPurpose = "print" | "screen"

// ページの印刷区画: 紙の大きさで区切った columns 列 × rows 行と、何かが載っている印刷区画の鍵（作るのは filled.ts の printSheetsOf）
export interface PrintSheets {
  columns: number
  rows: number
  filled: ReadonlySet<string>
}

declare module "../../../core/catalog" {
  interface BookTypeExtras {
    // 印刷区画の境目をまたぐ形の扱い: ask なら、印刷プレビューを開く前に直してもらう（利用者が手で形を置くタイプ）。
    // 無ければ、またいだまま紙の境目で切れて刷る（並べ方が自動のタイプ）。印刷区画より大きい形は、どちらでも切れて刷る
    printCrossing?: "ask"
  }
  interface PresentationExtras {
    // ページ page の印刷区画。並べ方を描くときに決める見せ方（ツリーなど）が、ビューがステージに知らせる広さと同じ座標で返す。
    // setting はそのページで効いている設定の値、grow は増やす向き（可変ページでなければ undefined）。purpose は数える物: print は印刷プレビューと
    // 印刷に並べる並べ方（改ページなど印刷のときだけの並べ直しのあと）、screen は書く画面の並べ方（何も載っていない印刷区画を暗くするのに使う）。
    // 無ければ、形の位置から決める（base の pageArea と filledSheets）
    printSheets?(
      catalog: CoreCatalog,
      page: ItemPage,
      on: { setting: SettingReader; grow: GrowSides | undefined; purpose: SheetPurpose },
    ): PrintSheets
  }
}

export {
  PRINT_PREVIEW_BOOK_NAME,
  PRINT_PREVIEW_FLOW,
  PRINT_PREVIEW_ORDER,
  PRINT_PREVIEW_PAGE_NAME,
  PRINT_PREVIEW_SETTINGS,
  PRINT_PREVIEW_SHEET_NUMBERS,
} from "./settings"

const SETTINGS = z.strictObject({
  [PRINT_PREVIEW_FLOW.id]: SheetFlowSchema.nullable().optional(),
  [PRINT_PREVIEW_ORDER.id]: SheetOrderSchema.nullable().optional(),
  [PRINT_PREVIEW_SHEET_NUMBERS.id]: ShownSchema.nullable().optional(),
  [PRINT_PREVIEW_BOOK_NAME.id]: ShownSchema.nullable().optional(),
  [PRINT_PREVIEW_PAGE_NAME.id]: ShownSchema.nullable().optional(),
})

// 印刷プレビューの設定の項目を変える（渡した項目だけ。null は既定に戻す）。印刷プレビューの設定を選んでいないタイプのブックには断る
export const PRINT_PREVIEW_UPDATE = kit.defineAction({
  id: "print-preview-update",
  history: false,
  inPrintPreview: "runs",
  attach: { pages: true },
  aiDescription: `Change how the print preview arranges a book's print areas (the book types with pages): ${PRINT_PREVIEW_FLOW.id} column (top to bottom, the default) or row (left to right); ${PRINT_PREVIEW_ORDER.id}, the order of a variable page's print areas, across (left to right, then the next row; the default) or down (top to bottom, then the next column); ${PRINT_PREVIEW_SHEET_NUMBERS.id}, ${PRINT_PREVIEW_BOOK_NAME.id} and ${PRINT_PREVIEW_PAGE_NAME.id}, shown or hidden (the default) on each sheet (with both names, "book - page" at the top left). Only what is given changes; null goes back to the default. The user's undo does not take it back.`,
  title: "Change print preview",
  target: "book",
  permissionScope: "book",
  args: z.strictObject({ settings: SETTINGS }),
  run: (book, args, ctx) => {
    const next = withBookSettings(ctx.catalog, book, args.settings, "print-preview")
    return next && { next, result: null }
  },
})

// 印刷プレビューで、並べる向きと交わる辺（縦に並べるなら幅、横なら高さ）を表示領域に合わせる（開いたときもこの見え方。もうこの見え方なら押せない）
export const PRINT_PREVIEW_FIT = kit.defineCommand({
  id: "print-preview-fit",
  title: "Fit to width",
  run: (ctx, a) => {
    const stage = stageOf(ctx)
    if (stage) moveView(a, stage, fitSideView(stage, sideOf(ctx)))
  },
  when: ctx => ctx.stage.mode === "print-preview",
  enabled: ctx => {
    const stage = stageOf(ctx)
    return stage !== undefined && fitSideView(stage, sideOf(ctx)) !== stage
  },
})

// 印刷プレビューで合わせる辺（縦に並べるなら幅、横に並べるなら高さ）
export function fitSide(catalog: CoreCatalog, book: Book | null): "width" | "height" {
  return book && settingValue(catalog, book, null, PRINT_PREVIEW_FLOW) === "row" ? "height" : "width"
}
const sideOf = (ctx: CommandContext) => fitSide(ctx.catalog, ctx.book)

// 開いているブックを、ステージ ctx.stage で印刷プレビューで見せる。右サイドパネルは印刷プレビューのビューが開く。
// 印刷区画の境目をまたいだ形を直してもらうタイプで、またいだ形があれば、印刷プレビューは開かず、それを知らせる右サイドパネルを開く
function openPreview(ctx: CommandContext, a: CommandActions) {
  const book = ctx.book
  const now = workspaceOf(ctx).stages.find(s => s.id === ctx.stage.id)
  const opened = now?.opened
  if (book && now && opened && hasCrossing(ctx.catalog, book)) {
    const open = { ...printCheckOpen(book.id), book: opened.book, page: opened.page }
    a.updateStageState(state => withOpened(state, open, now))
    return
  }
  a.openPrintPreview(ctx.stage.id)
}

// 開いているブックを印刷プレビューで見せる（ページを持つブックを編集している間）
export const PRINT_PREVIEW_OPEN = kit.defineCommand({
  id: "print-preview-open",
  title: "Print preview",
  run: (ctx, a) => openPreview(ctx, a),
  when: ctx => ctx.book !== null && hasPages(ctx.book) && ctx.stage.mode === "edit",
})

// 印刷: 印刷プレビューの間は、並べた印刷区画を刷る（印刷ダイアログ。測っている途中と、並べる物が無い間は押せない）。
// 編集している間は、印刷プレビューを開く（すぐには刷らない）
export const PRINT = kit.defineCommand({
  id: "print",
  title: "Print",
  run: (ctx, a) => {
    if (ctx.stage.mode === "edit") openPreview(ctx, a)
    else if (printReadyOf(ctx.stageState)) a.requestPrint()
  },
  when: ctx => ctx.book !== null && hasPages(ctx.book),
  enabled: ctx => ctx.stage.mode === "edit" || printReadyOf(ctx.stageState),
})

export const PRINT_KEYS = [kit.defineKey({ id: "print-mod-p", key: "Mod+P", command: PRINT.id, scope: "stage" })]

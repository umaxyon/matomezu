// 印刷プレビュー: ステージで開いたブックの全ページの印刷区画を並べて、見るだけで見せる（ステージの見え方は core/stage.ts の StageMode）。
// 開くのはフッタメニューのボタン（コマンド print-preview-open）。開くと右サイドパネルに印刷プレビューの設定を出し、右サイドパネルを閉じれば印刷プレビューも閉じる
// （閉じたときに戻す見え方は、ステージの印刷プレビューが持つ。右サイドパネルの戻しは使わない）。
// 設定（settings.ts）を変えるのはアクション print-preview-update だけで、印刷プレビューの間も行え、画面の履歴（Undo）には入れない

import { z } from "zod"
import type { CoreCatalog } from "../../../core/core-catalog"
import type { ItemPage } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import type { CommandActions, CommandContext } from "../../../store/commands/def"
import { calledStageOf, NO_BOOK } from "../../../store/commands/def"
import { withBookSettings } from "../book-look"
import type { SettingReader } from "../book-settings"
import { bookSettingsPatch, bookSettingValue } from "../book-settings"
import { kit } from "../kit"
import type { GrowSides } from "../place/grow"
import { openRightSidePanelIn } from "../right-side-panel/state"
import { fitSideView, moveHere } from "../zoom"
import { hasCrossing } from "./book-sheets"
import { printCheckOpen } from "./panel-id"
import { PRINT_READY_STATE } from "./print-state"
import { PRINT_PREVIEW_FLOW } from "./settings"

// 印刷区画を数える物: print は印刷プレビューと印刷に並べる並べ方、screen はステージに描く並べ方
export type SheetPurpose = "print" | "screen"

// ページの印刷区画: 紙の大きさで区切った columns 列 × rows 行と、何かが載っている印刷区画の鍵（作るのは filled.ts の printSheetsOf）
export interface PrintSheets {
  columns: number
  rows: number
  filled: ReadonlySet<string>
}

declare module "../../../core/catalog" {
  interface PageTypeExtras {
    // 印刷区画の境目をまたぐ形の扱い: ask なら、印刷プレビューを開く前に直してもらう（利用者が手で形を置くタイプ）。
    // 無ければ、またいだまま紙の境目で切れて刷る（並べ方が自動のタイプ）。印刷区画より大きい形は、どちらでも切れて刷る
    printCrossing?: "ask"
  }
  interface PresentationExtras {
    // ページ page の印刷区画。並べ方を描くときに決めるプレゼンテーション（ツリーなど）が、ビューがステージに知らせる広さと同じ座標で返す。
    // setting はそのページで効いている設定の値、grow は増やす向き（可変ページでなければ undefined）。purpose は数える物: print は印刷プレビューと
    // 印刷に並べる並べ方（改ページなど印刷のときだけの並べ直しのあと）、screen はステージに描く並べ方（何も載っていない印刷区画を暗くするのに使う）。
    // 無ければ、形の位置から決める（base の pageArea と filledSheets）
    printSheets?(
      catalog: CoreCatalog,
      page: ItemPage,
      on: { setting: SettingReader; grow: GrowSides | undefined; purpose: SheetPurpose },
    ): PrintSheets
  }
}

export {
  BACKGROUND_PRINT,
  PRINT_PREVIEW_BOOK_NAME,
  PRINT_PREVIEW_FLOW,
  PRINT_PREVIEW_ORDER,
  PRINT_PREVIEW_PAGE_NAME,
  PRINT_PREVIEW_SETTING_CHECK,
  PRINT_PREVIEW_SHEET_NUMBERS,
} from "./settings"

const ARGS = z.strictObject({
  settings: z.record(z.string(), z.unknown()), // 印刷プレビューの設定の項目（printPreview。形は機能台帳で決まるので AI には describeArgs で見せる）
})

// 印刷プレビューの設定の項目を変える（渡した項目だけ。null は既定に戻す）。印刷プレビューの組に無い項目や形に合わない値は、どの項目かを添えて断る
export const PRINT_PREVIEW_UPDATE = kit.defineAction({
  id: "print-preview-update",
  history: false,
  inPrintPreview: "runs",
  attach: { books: true },
  aiDescription:
    "Change a book's print preview settings (how the print preview arranges and labels the print areas), keyed by the setting's id; the settings and their values are in args. Only what is given changes; null goes back to the default. The other settings of a book are changed by @matomezu/base:book-update (refused here). The user's undo does not take it back.",
  title: "Change print preview",
  target: "book",
  permissionScope: "book",
  args: ARGS,
  describeArgs: catalog =>
    z.strictObject({ settings: bookSettingsPatch(catalog, "print-preview") ?? z.strictObject({}) }),
  run: (book, args, ctx) => {
    const next = withBookSettings(ctx.catalog, book, args.settings, "print-preview")
    return "declined" in next ? next : { next, result: null }
  },
})

// 印刷プレビューで、並べる向きと交わる辺（縦に並べるなら幅、横なら高さ）を表示領域に合わせる（開いたときもこの見え方。もうこの見え方なら押せない）
export const PRINT_PREVIEW_FIT = kit.defineCommand({
  id: "print-preview-fit",
  title: "Fit to width",
  run: (ctx, a) => {
    const stage = calledStageOf(ctx)
    if (stage) moveHere(a, stage, fitSideView(stage, sideOf(ctx)))
  },
  when: ctx => ctx.stage.mode === "print-preview",
  enabled: ctx => {
    const stage = calledStageOf(ctx)
    return stage !== undefined && fitSideView(stage, sideOf(ctx)) !== stage
  },
})

// 印刷プレビューで合わせる辺（縦に並べるなら幅、横に並べるなら高さ）
export function fitSide(catalog: CoreCatalog, book: Book | null): "width" | "height" {
  return book && bookSettingValue(catalog, book, PRINT_PREVIEW_FLOW) === "row" ? "height" : "width"
}
const sideOf = (ctx: CommandContext) => fitSide(ctx.catalog, ctx.book === NO_BOOK ? null : ctx.book)

// 開いているブックを、ステージ ctx.stage で印刷プレビューで見せる。右サイドパネルは印刷プレビューのビューが開く。
// 印刷区画の境目をまたいだ形を直してもらうタイプで、またいだ形があれば、印刷プレビューは開かず、それを知らせる右サイドパネルを開く
function openPreview(ctx: CommandContext, a: CommandActions) {
  const book = ctx.book
  if (book !== NO_BOOK && calledStageOf(ctx)?.opened && hasCrossing(ctx.catalog, book)) {
    openRightSidePanelIn(ctx, a, printCheckOpen(book.id))
    return
  }
  a.openPrintPreview()
}

// 開いているブックを印刷プレビューで見せる（ページを持つブックを編集している間）

export const PRINT_PREVIEW_OPEN = kit.defineCommand({
  id: "print-preview-open",
  title: "Print preview",
  run: (ctx, a) => openPreview(ctx, a),
  when: ctx => ctx.book !== NO_BOOK && ctx.stage.mode === "edit",
})

// 印刷: 印刷プレビューの間は、並べた印刷区画を刷る（印刷ダイアログ。測っている途中と、並べる物が無い間は押せない）。
// 編集している間は、印刷プレビューを開く（すぐには刷らない）
export const PRINT = kit.defineCommand({
  id: "print",
  title: "Print",
  run: (ctx, a) => {
    if (ctx.stage.mode === "edit") openPreview(ctx, a)
    else if (ctx.pluginState(PRINT_READY_STATE)) a.requestPrint()
  },
  when: ctx => ctx.book !== NO_BOOK,
  enabled: ctx => ctx.stage.mode === "edit" || ctx.pluginState(PRINT_READY_STATE) === true,
})

export const PRINT_KEYS = [kit.defineKey({ id: "print-mod-p", key: "Mod+P", command: PRINT.id, scope: "stage" })]
export { breakShift } from "./breaks"
export { printSheetsOf, sheetShapes, sheetsOfShape } from "./filled"
export { MEASURES_STATES, type PRINT_MEASURES } from "./measures-state"
export { PRINT_PREVIEW_STATES, type PRINT_READY_STATE } from "./print-state"

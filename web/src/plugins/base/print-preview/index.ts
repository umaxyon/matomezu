// 印刷プレビュー: ステージで開いたブックの全ページの印刷区画を並べて、見るだけで見せる（ステージの見え方は core/stage.ts の StageMode）。
// 開くのはフッタメニューのボタン（コマンド print-preview-open）。開くと右サイドパネルに印刷プレビューの設定を出し、右サイドパネルを閉じれば印刷プレビューも閉じる。
// 設定（settings.ts）を変えるのはアクション print-preview-update だけで、印刷プレビューの間も行え、画面の履歴（Undo）には入れない
import { z } from "zod"
import { hasPages } from "../../../core/book"
import { workspaceOf } from "../../../store/commands/def"
import { withBookSettings } from "../book-look"
import { kit } from "../kit"
import { withOpened } from "../right-side-panel/state"
import { PRINT_PREVIEW_PANEL_ID } from "./panel-id"
import {
  PRINT_PREVIEW_BOOK_NAME,
  PRINT_PREVIEW_FLOW,
  PRINT_PREVIEW_ORDER,
  PRINT_PREVIEW_PAGE_NUMBERS,
  SheetFlowSchema,
  SheetOrderSchema,
  ShownSchema,
} from "./settings"

export {
  PRINT_PREVIEW_BOOK_NAME,
  PRINT_PREVIEW_FLOW,
  PRINT_PREVIEW_ORDER,
  PRINT_PREVIEW_PAGE_NUMBERS,
  PRINT_PREVIEW_SETTINGS,
} from "./settings"

const SETTINGS = z.strictObject({
  [PRINT_PREVIEW_FLOW.id]: SheetFlowSchema.nullable().optional(),
  [PRINT_PREVIEW_ORDER.id]: SheetOrderSchema.nullable().optional(),
  [PRINT_PREVIEW_PAGE_NUMBERS.id]: ShownSchema.nullable().optional(),
  [PRINT_PREVIEW_BOOK_NAME.id]: ShownSchema.nullable().optional(),
})

// 印刷プレビューの設定の項目を変える（渡した項目だけ。null は既定に戻す）。印刷プレビューの設定を選んでいないタイプのブックには断る
export const PRINT_PREVIEW_UPDATE = kit.defineAction({
  id: "print-preview-update",
  history: false,
  inPrintPreview: "runs",
  attach: { pages: true },
  aiDescription: `Change how the print preview arranges a book's print areas (the book types with pages): ${PRINT_PREVIEW_FLOW.id} column (top to bottom, the default) or row (left to right); ${PRINT_PREVIEW_ORDER.id}, the order of a variable page's print areas, across (left to right, then the next row; the default) or down (top to bottom, then the next column); ${PRINT_PREVIEW_PAGE_NUMBERS.id} and ${PRINT_PREVIEW_BOOK_NAME.id}, shown or hidden (the default) on each sheet. Only what is given changes; null goes back to the default. The user's undo does not take it back.`,
  title: "Change print preview",
  target: "book",
  permissionScope: "book",
  args: z.strictObject({ settings: SETTINGS }),
  run: (book, args, ctx) => {
    const next = withBookSettings(ctx.catalog, book, args.settings)
    return next && { next, result: null }
  },
})

// 開いているブックを印刷プレビューで見せる（ページを持つブックを編集している間）。右サイドパネルに設定を出す（閉じたら戻す見え方も覚える）
export const PRINT_PREVIEW_OPEN = kit.defineCommand({
  id: "print-preview-open",
  title: "Print preview",
  run: (ctx, a) => {
    const now = workspaceOf(ctx).stages.find(s => s.id === ctx.stage.id)
    const opened = now?.opened
    if (!now || !opened) return
    a.updateStageState(state =>
      withOpened(
        state,
        {
          widget: PRINT_PREVIEW_PANEL_ID,
          subject: opened.book,
          anchors: [],
          current: opened.book,
          book: opened.book,
          page: opened.page,
        },
        now,
      ),
    )
    a.openPrintPreview(ctx.stage.id)
  },
  when: ctx => ctx.book !== null && hasPages(ctx.book) && ctx.stage.mode === "edit",
})

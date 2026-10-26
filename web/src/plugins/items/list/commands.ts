// リストの行のコマンド: 行の追加・編集のダイアログを開く、行を消す、チェックを入れ切りする、行を動かす、行の下の端をドラッグして高さを変える（リストのビューと、行の右クリックのメニューから呼ぶ）
import { type CommandContext, type Point, pagedOf, toPaperDelta } from "../../../plugin-api"
import { kit } from "./kit"
import { linesFor } from "./size"

const onDrawingPage = (ctx: CommandContext) => pagedOf(ctx.book) !== undefined && ctx.stage.opened?.page != null

// リスト list の最後に行を足すダイアログを開く
export const LIST_ADD_ROW = kit.defineCommand({
  id: "list-add-row",
  performs: ["@matomezu/list:row-add"],
  title: "Add row",
  run: (ctx, a, { list }: { list: string }) => {
    const page = ctx.stage.opened?.page
    if (page) a.openDialog(ctx.stage.id, "@matomezu/list:row-add", { page, list })
  },
  when: onDrawingPage,
})

// 行の中身を変えるダイアログを開く
export const LIST_EDIT_ROW = kit.defineCommand({
  id: "list-edit-row",
  performs: ["@matomezu/list:row-update"],
  title: "Edit row",
  run: (ctx, a, { list, row }: { list: string; row: string }) => {
    const page = ctx.stage.opened?.page
    if (page) a.openDialog(ctx.stage.id, "@matomezu/list:row-edit", { page, list, row })
  },
  when: onDrawingPage,
})

// 行を消す
export const LIST_DELETE_ROW = kit.defineCommand({
  id: "list-delete-row",
  performs: ["@matomezu/list:row-remove"],
  title: "Delete row",
  run: (ctx, a, { list, row }: { list: string; row: string }) => {
    const { opened } = ctx.stage
    if (opened?.page)
      a.perform("@matomezu/list:row-remove", { page: opened.page, list, rows: [row] }, { book: opened.book })
  },
  when: onDrawingPage,
})

// 行のチェックを入れる・外す
export const LIST_CHECK = kit.defineCommand({
  id: "list-check",
  performs: ["@matomezu/list:row-check"],
  title: "Check",
  run: (ctx, a, { list, row, checked }: { list: string; row: string; checked: boolean }) => {
    const { opened } = ctx.stage
    if (opened?.page)
      a.perform("@matomezu/list:row-check", { page: opened.page, list, row, checked }, { book: opened.book })
  },
  when: onDrawingPage,
})

// 行の下の端を、画面の上で by だけ動かしたとき: 高さ height（紙の上）の行を、一番近い行数の高さにする（size.ts の linesFor）
export const LIST_STRETCH_ROW = kit.defineCommand({
  id: "list-stretch-row",
  performs: ["@matomezu/list:row-lines"],
  title: "Set row heights",
  run: (ctx, a, { list, row, height, by }: { list: string; row: string; height: number; by: Point }) => {
    const { opened } = ctx.stage
    if (!opened?.page) return
    const lines = linesFor(height + toPaperDelta(ctx.stage, by).y)
    a.perform("@matomezu/list:row-lines", { page: opened.page, list, rows: [row], lines }, { book: opened.book })
  },
  when: onDrawingPage,
})

// 行を動かす: リスト to（無ければ同じリスト）の行 before の前（無ければ最後）へ（行のドラッグで離したとき）
export const LIST_MOVE_ROW = kit.defineCommand({
  id: "list-move-row",
  performs: ["@matomezu/list:row-move"],
  title: "Move row",
  run: (ctx, a, args: { list: string; row: string; to: string; before?: string }) => {
    const { opened } = ctx.stage
    if (!opened?.page) return
    const before = args.before === undefined ? {} : { before: args.before }
    a.perform(
      "@matomezu/list:row-move",
      { page: opened.page, list: args.list, row: args.row, to: args.to, ...before },
      { book: opened.book },
    )
  },
  when: onDrawingPage,
})

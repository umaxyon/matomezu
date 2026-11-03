// リストの行のコマンド: 行の追加・編集のダイアログを開く、行を消す（選んでいる行を Delete で消すのも）、チェックを入れ切りする、行を動かす、行の下の端をドラッグして高さを変える（リストのビューと、行の右クリックのメニューから呼ぶ）
import { type CommandContext, type ItemPage, type Point, pagedOf, toPaperDelta, walkShapes } from "../../../plugin-api"
import { ROW_ADD, ROW_CHECK, ROW_LINES, ROW_MOVE, ROW_REMOVE, ROW_UPDATE } from "./actions"
import { kit } from "./kit"
import { LIST, LIST_ROWS_SCOPE, type ListRow, ROW_ADD_DIALOG, ROW_EDIT_DIALOG } from "./list"
import { linesFor } from "./size"

// ページを開いているか（ページの無いブックと、ページが 1 枚も無いブックでは開いていない）
const onOpenedPage = (ctx: CommandContext) => ctx.stage.opened?.page != null

// リスト list の最後に行を足すダイアログを開く
export const LIST_ADD_ROW = kit.defineCommand({
  id: "list-add-row",
  performs: [ROW_ADD.id],
  permissionScope: "opened-page",
  title: "Add row",
  run: (ctx, a, { list }: { list: string }) => {
    const page = ctx.stage.opened?.page
    if (page) a.openDialog(ctx.stage.id, ROW_ADD_DIALOG.id, { page, list })
  },
  when: onOpenedPage,
})

// 行の中身を変えるダイアログを開く
export const LIST_EDIT_ROW = kit.defineCommand({
  id: "list-edit-row",
  performs: [ROW_UPDATE.id],
  permissionScope: "opened-page",
  title: "Edit row",
  run: (ctx, a, { list, row }: { list: string; row: string }) => {
    const page = ctx.stage.opened?.page
    if (page) a.openDialog(ctx.stage.id, ROW_EDIT_DIALOG.id, { page, list, row })
  },
  when: onOpenedPage,
})

// 行を消す
export const LIST_DELETE_ROW = kit.defineCommand({
  id: "list-delete-row",
  performs: [ROW_REMOVE.id],
  permissionScope: "opened-page",
  title: "Delete row",
  run: (ctx, a, { list, row }: { list: string; row: string }) => {
    const { opened } = ctx.stage
    if (opened?.page) a.perform(ROW_REMOVE.id, { page: opened.page, list, rows: [row] }, { book: opened.book })
  },
  when: onOpenedPage,
})

// 選んでいる物が、開いているページの 1 つのリストの行だけなら、そのリストと行（でなければ null）
function selectedRows(ctx: CommandContext): { page: string; list: string; rows: readonly string[] } | null {
  const { opened, selection } = ctx.stage
  const page = pagedOf(ctx.book)?.pages.find(p => p.id === opened?.page)
  if (!page || selection.length === 0) return null
  const list = walkLists(page).find(l => selection.every(id => l.rows.includes(id)))
  return list ? { page: page.id, list: list.id, rows: selection } : null
}

// ページのリスト（どの深さも）と、その行の id
const walkLists = (page: ItemPage) =>
  walkShapes(page).flatMap(({ shape }) =>
    shape.item === LIST.id ? [{ id: shape.id, rows: ((shape.children ?? []) as ListRow[]).map(r => r.id) }] : [],
  )

// 選んでいる行を消し、選択を外す（選んでいる物が 1 つのリストの行だけのとき。行の並びのキーの範囲の Delete）
export const LIST_DELETE_ROWS = kit.defineCommand({
  id: "list-delete-rows",
  performs: [ROW_REMOVE.id],
  permissionScope: "opened-page",
  title: "Delete rows",
  run: (ctx, a) => {
    const found = selectedRows(ctx)
    const book = ctx.stage.opened?.book
    if (!found || !book) return
    const done = a.perform(ROW_REMOVE.id, { page: found.page, list: found.list, rows: [...found.rows] }, { book })
    if (done.ok) a.select(ctx.stage.id, [])
  },
  when: ctx => selectedRows(ctx) !== null,
})

// 行のチェックを入れる・外す
export const LIST_CHECK = kit.defineCommand({
  id: "list-check",
  performs: [ROW_CHECK.id],
  permissionScope: "opened-page",
  title: "Check",
  run: (ctx, a, { list, row, checked }: { list: string; row: string; checked: boolean }) => {
    const { opened } = ctx.stage
    if (opened?.page) a.perform(ROW_CHECK.id, { page: opened.page, list, row, checked }, { book: opened.book })
  },
  when: onOpenedPage,
})

// 行の下の端を、画面の上で by だけ動かしたとき: 高さ height（紙の上）の行を、一番近い行数の高さにする（size.ts の linesFor）
export const LIST_STRETCH_ROW = kit.defineCommand({
  id: "list-stretch-row",
  performs: [ROW_LINES.id],
  permissionScope: "opened-page",
  title: "Set row heights",
  run: (ctx, a, { list, row, height, by }: { list: string; row: string; height: number; by: Point }) => {
    const { opened } = ctx.stage
    if (!opened?.page) return
    const lines = linesFor(height + toPaperDelta(ctx.stage, by).y)
    a.perform(ROW_LINES.id, { page: opened.page, list, rows: [row], lines }, { book: opened.book })
  },
  when: onOpenedPage,
})

// 行を動かす: リスト to（無ければ同じリスト）の行 before の前（無ければ最後）へ（行のドラッグで離したとき）
export const LIST_MOVE_ROW = kit.defineCommand({
  id: "list-move-row",
  performs: [ROW_MOVE.id],
  permissionScope: "opened-page",
  title: "Move row",
  run: (ctx, a, args: { list: string; row: string; to: string; before?: string }) => {
    const { opened } = ctx.stage
    if (!opened?.page) return
    const before = args.before === undefined ? {} : { before: args.before }
    a.perform(
      ROW_MOVE.id,
      { page: opened.page, list: args.list, row: args.row, to: args.to, ...before },
      { book: opened.book },
    )
  },
  when: onOpenedPage,
})

// 選んでいる行を消すキー（Mac の delete キーは Backspace として届く）
export const LIST_KEYS = [
  kit.defineKey({ id: "list-delete-rows-delete", key: "Delete", command: LIST_DELETE_ROWS.id, scope: LIST_ROWS_SCOPE }),
  kit.defineKey({
    id: "list-delete-rows-backspace",
    key: "Backspace",
    command: LIST_DELETE_ROWS.id,
    scope: LIST_ROWS_SCOPE,
  }),
]

// リストの行のコマンド: 行の追加・編集のダイアログを開く、行を消す、チェックを入れ切りする（リストのビューと、行の右クリックのメニューから呼ぶ）
import { type CommandContext, defineCommand } from "../../../../store/commands/def"

const onDrawingPage = (ctx: CommandContext) => ctx.book?.type === "drawing" && ctx.stage.opened?.page != null

// リスト list の最後に行を足すダイアログを開く
export const LIST_ADD_ROW = defineCommand({
  id: "list.addRow",
  title: "Add row",
  run: (ctx, a, { list }: { list: string }) => {
    const page = ctx.stage.opened?.page
    if (page) a.openDialog(ctx.stage.id, "row.add", { page, list })
  },
  when: onDrawingPage,
})

// 行の中身を変えるダイアログを開く
export const LIST_EDIT_ROW = defineCommand({
  id: "list.editRow",
  title: "Edit row",
  run: (ctx, a, { list, row }: { list: string; row: string }) => {
    const page = ctx.stage.opened?.page
    if (page) a.openDialog(ctx.stage.id, "row.edit", { page, list, row })
  },
  when: onDrawingPage,
})

// 行を消す
export const LIST_DELETE_ROW = defineCommand({
  id: "list.deleteRow",
  title: "Delete row",
  run: (ctx, a, { list, row }: { list: string; row: string }) => {
    const { opened } = ctx.stage
    if (opened?.page) a.perform("row.remove", { page: opened.page, list, rows: [row] }, { book: opened.book })
  },
  when: onDrawingPage,
})

// 行のチェックを入れる・外す
export const LIST_CHECK = defineCommand({
  id: "list.check",
  title: "Check",
  run: (ctx, a, { list, row, checked }: { list: string; row: string; checked: boolean }) => {
    const { opened } = ctx.stage
    if (opened?.page) a.perform("row.check", { page: opened.page, list, row, checked }, { book: opened.book })
  },
  when: onDrawingPage,
})

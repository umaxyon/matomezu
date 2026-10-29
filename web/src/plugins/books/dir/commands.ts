// ディレクトリ構成図のコマンド: フォルダを開け閉めする（▸・▾ が呼ぶ。鉛筆でもハンドでも。編集のロックなどでアクションが止められていれば押せない）
import { type CommandContext, pagedOf } from "../../../plugin-api"
import { refusalMessage } from "../../base"
import { FOLDER_CLOSE } from "./actions"
import { entryOf } from "./edit"
import { DirFolderSchema } from "./entry"
import { kit } from "./kit"

// 開いているページと、その根（ディレクトリ構成図のページでなければ null）
export function dirAt(ctx: CommandContext) {
  const book = pagedOf(ctx.book)
  const page = book?.pages.find(p => p.id === ctx.stage.opened?.page)
  const root = DirFolderSchema.safeParse(page && "root" in page ? page.root : undefined)
  if (!book || !page || !root.success) return null
  return { book, page, root: root.data }
}

// フォルダ folder を開け閉めする（開いていれば閉じ、閉じていれば開く）。開くと紙に入らず断られたら、トーストで知らせる
export const FOLDER_TOGGLE = kit.defineCommand({
  id: "folder-toggle",
  performs: [FOLDER_CLOSE.id],
  permissionScope: "opened-page",
  title: "Open or close folder",
  run: (ctx, a, args: { folder: string }) => {
    const dir = dirAt(ctx)
    const opened = ctx.stage.opened
    const folder = dir && entryOf(dir.root, args.folder)
    if (!dir || !opened || folder?.kind !== "folder") return
    const closed = folder.closed !== true
    const done = a.perform(FOLDER_CLOSE.id, { page: dir.page.id, folder: folder.id, closed }, { book: opened.book })
    if (!done.ok)
      a.showToast({
        kind: "warn",
        message: refusalMessage(ctx.catalog, done, kit.message("Does not fit on the paper")),
      })
  },
  when: ctx => dirAt(ctx) !== null,
})

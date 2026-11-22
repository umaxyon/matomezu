// 書庫からページを作る: page-create は、ブックの中か、書庫ホーム・フォルダの直下（ブックの外）にページを作る（本体はページタブの page-add と同じ）。書庫が対象。
// 書庫ホーム・フォルダでは、バインダにまとまるタイプのページは、そのページだけの新しいバインダに入る。ブックの外のバインダを名指せば、その中に足す。
// 本体が同じなので、ページのタイプが page-add を外していれば（without）、これもそのタイプで断る
import { z } from "zod"
import { findBinder } from "../../../core/book"
import { CREATES_NOTHING } from "../../../core/def/action"
import { isMoveRefusal, placedMade, titlesIn } from "../../../core/entries"
import { HOME_ID } from "../../../core/folders"
import { bookOf, withBinderEntry, withBook } from "../../../core/folders-books"
import { outsideBinderIn, pinnedCount } from "../../../core/folders-tree"
import { kit } from "../kit"
import { describeNewPage, NEW_PAGE_ARGS, PAGE_ADD, untitledAmong, withNewPage } from "../pages/page-add"
import { holdsEntries, placedOutsideTrash, typeLets } from "./entries"

const PAGE_CREATE_ARGS = NEW_PAGE_ARGS.extend({ folder: z.string().min(1) })

export const PAGE_CREATE = kit.defineAction({
  id: "page-create",
  aiDescription:
    "Create a page in the library: folder is the id of a book, of a folder, of the library home or of a binder that is not in a book (see read_folder). The other arguments are those of page-add. In a book it does what page-add does. In a folder or the library home the page is made outside books: index is the position among the entries of that folder (the end without it; not before the system folders of the library home), and a page of a type that goes in a binder takes into {newBinder} only (a new binder holding that page is put in the folder). In a binder that is not in a book the page is added to that binder (leave into out; index is the position in the binder). Returns what page-add returns. Refused for a folder in the trash, for a title another entry of the folder has, for a page type that leaves page-add out, and as page-add refuses.",
  title: "New page",
  target: "library",
  // 作るページのタイプと入れるフォルダで問う（core が、ブックならそのブックに、ほかなら空のページで問う）
  permissionScope: (args: { folder: string; type: string }) => ({
    books: [],
    pages: [{ creates: args.type, into: args.folder }],
    creates: CREATES_NOTHING,
  }),
  args: PAGE_CREATE_ARGS,
  describeArgs: catalog => describeNewPage(catalog).extend({ folder: z.string().min(1) }),
  run: (library, { folder, ...args }, ctx) => {
    if (!typeLets(ctx.catalog, PAGE_ADD.id, args.type)) return null
    const holder = library.folders[folder]
    if (holder?.folderRole === "book") {
      const book = placedOutsideTrash(library.folders, folder) === undefined ? undefined : bookOf(library, folder)
      const done = book && withNewPage(ctx.catalog, book, args, ctx)
      return done ? { next: withBook(library, done.book), result: done.result } : null
    }
    if (holder?.folderRole === "binder") {
      // ブックの外のバインダ: その中に足す（into は書かないか、そのバインダを名指す）
      const binder = outsideBinderIn(library, folder)
      if (!binder || (args.into && !("binder" in args.into && args.into.binder === folder))) return null
      const done = withNewPage(
        ctx.catalog,
        { id: binder.id, lineup: [binder] },
        { ...args, into: { binder: folder } },
        ctx,
      )
      const now = done && findBinder(done.book, binder.id)
      return done && now ? { next: withBinderEntry(library, binder, now), result: done.result } : null
    }
    if (!holder || !holdsEntries(library.folders, folder)) return null
    // 書庫ホームでは、先頭に並ぶシステムフォルダより前に置けない
    const { index, ...rest } = args
    if (index !== undefined && folder === HOME_ID && index < pinnedCount(library.folders)) return null
    // 名前を言わなければ、置くフォルダの名前と重ならない「（無題）」（バインダにまとまるタイプは、フォルダに並ぶのがバインダなので、ページの名前は本体に任せる）
    const title =
      rest.title ??
      (rest.into ? undefined : untitledAmong(ctx.catalog, ctx.lang, titlesIn(library, holder, ctx.naming)))
    const done = withNewPage(ctx.catalog, { id: holder.id, lineup: [] }, { ...rest, ...(title ? { title } : {}) }, ctx)
    const [made] = done?.book.lineup ?? []
    if (!done || !made) return null
    const next = placedMade(library, made, folder, index)
    return isMoveRefusal(next) ? null : { next, result: done.result }
  },
})

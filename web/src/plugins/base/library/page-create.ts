// 書庫からページを作る: page-create は、ブックの中か、書庫ホーム・フォルダの直下（ブックの外）にページを作る（本体はページタブの page-add と同じ）。書庫が対象。
// 書庫ホーム・フォルダでは、バインダにまとまるタイプのページは、そのページだけの新しいバインダに入る。ブックの外のバインダを名指せば、その中に足す。
// 入れるフォルダを言わなければ、その日の入れ先（today-folder.ts）の末尾に入る。
// 本体が同じなので、ページのタイプが page-add を外していれば（without）、これもそのタイプで断る
import { z } from "zod"
import { findBinder } from "../../../core/book"
import type { ActionContext } from "../../../core/def/action"
import { isMoveRefusal, placedMade, titlesIn } from "../../../core/entries"
import { HOME_ID, type HomeOrFolder, type Library } from "../../../core/folders"
import { bookOf, withBinderEntry, withBook } from "../../../core/folders-books"
import { outsideBinderIn, pinnedCount } from "../../../core/folders-tree"
import { kit } from "../kit"
import { describeNewPage, NEW_PAGE_ARGS, PAGE_ADD, untitledAmong, withNewPage } from "../pages/page-add"
import { holdsEntries, placedOutsideTrash, typeLets } from "./entries"
import { todayFolderIn, withTodayFolder } from "./today-folder"

// 入れるフォルダを言わないときは、位置 index も言えない（入れ先のフォルダが、まだ無いかもしれない）
const withFolder = <T extends typeof NEW_PAGE_ARGS>(args: T) =>
  args
    .extend({ folder: z.string().min(1).optional() })
    .refine(a => a.folder !== undefined || a.index === undefined, { path: ["index"], message: "index needs folder" })
const PAGE_CREATE_ARGS = withFolder(NEW_PAGE_ARGS)

export const PAGE_CREATE = kit.defineAction({
  id: "page-create",
  aiDescription:
    "Create a page in the library: folder is the id of a book, of a folder, of the library home or of a binder that is not in a book (see read_folder). Without folder the page goes into the folder named today's date (YYYY-MM-DD) in the documents folder, made when missing (at its end; index is not taken). The other arguments are those of page-add. In a book it does what page-add does. In a folder or the library home the page is made outside books: index is the position among the entries of that folder (the end without it; not before the system folders of the library home), and a page of a type that goes in a binder takes into {newBinder} only (a new binder holding that page is put in the folder). In a binder that is not in a book the page is added to that binder (leave into out; index is the position in the binder). Returns what page-add returns, and folder: the id of what the new entry was put in (the book, the binder that is not in a book, or the folder). Refused for a folder in the trash, for a title another entry of the folder has, for a page type that leaves page-add out, and as page-add refuses.",
  title: "New page",
  target: "library",
  // 作るページのタイプと入れるフォルダで問う（core が、ブックならそのブックに、ほかなら空のページで問う）
  permissionScope: (args: { folder?: string | undefined; type: string }) => ({
    books: [],
    pages: [{ creates: args.type, ...(args.folder === undefined ? {} : { into: args.folder }) }],
    creates: false,
  }),
  args: PAGE_CREATE_ARGS,
  describeArgs: catalog => withFolder(describeNewPage(catalog) as typeof NEW_PAGE_ARGS),
  run: (library, { folder: named, ...args }, ctx) => {
    if (!typeLets(ctx.catalog, PAGE_ADD.id, args.type)) return null
    if (named === undefined) return createdToday(library, args, ctx)
    const folder = named
    const holder = library.folders[folder]
    if (holder?.folderRole === "book") {
      const book = placedOutsideTrash(library.folders, folder) === undefined ? undefined : bookOf(library, folder)
      const done = book && withNewPage(ctx.catalog, book, args, ctx)
      return done ? { next: withBook(library, done.book), result: { ...done.result, folder } } : null
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
      return done && now ? { next: withBinderEntry(library, binder, now), result: { ...done.result, folder } } : null
    }
    if (!holder || !holdsEntries(library.folders, folder)) return null
    // 書庫ホームでは、先頭に並ぶシステムフォルダより前に置けない
    const { index, ...rest } = args
    if (index !== undefined && folder === HOME_ID && index < pinnedCount(library.folders)) return null
    const made = madeOutside(library, holder, rest, ctx)
    const next = made && placedMade(library, made.entry, folder, index)
    return !made || !next || isMoveRefusal(next) ? null : { next, result: { ...made.result, folder } }
  },
})

type Args = z.output<typeof NEW_PAGE_ARGS>
type Ctx = ActionContext

// フォルダ holder（まだ無ければ undefined）に置く、ブックの外のページ（バインダにまとまるタイプなら、そのページだけの新しいバインダ）を作った物と、page-add の result。
// 名前を言わなければ、置くフォルダの名前と重ならない「（無題）」（バインダにまとまるタイプは、フォルダに並ぶのがバインダなので、ページの名前は本体に任せる）
function madeOutside(library: Library, holder: HomeOrFolder | undefined, args: Omit<Args, "index">, ctx: Ctx) {
  const taken = holder ? titlesIn(library, holder, ctx.naming) : []
  const title = args.title ?? (args.into ? undefined : untitledAmong(ctx.catalog, ctx.lang, taken))
  const done = withNewPage(
    ctx.catalog,
    { id: holder?.id ?? "", lineup: [] },
    { ...args, ...(title ? { title } : {}) },
    ctx,
  )
  const [entry] = done?.book.lineup ?? []
  return done && entry ? { entry, result: done.result } : null
}

// 入れるフォルダを言わずに作る: その日の入れ先の末尾に入れる（入れ先が無ければ、同じ書き込みで作る）。
// 入れ先のフォルダの id は、ページの id の後に、いつも引く（入れ先がもう在っても、振る id の順が変わらない）
function createdToday(library: Library, args: Args, ctx: Ctx) {
  const there = todayFolderIn(library, ctx.today)
  const holder = there === undefined ? undefined : library.folders[there]
  if (holder && holder.folderRole !== "folder") return null
  const made = madeOutside(library, holder, args, ctx)
  const placed = made && withTodayFolder(library, ctx.today, ctx.newId())
  const next = placed && placedMade(placed.library, made.entry, placed.folder)
  return !made || !placed || !next || isMoveRefusal(next)
    ? null
    : { next, result: { ...made.result, folder: placed.folder } }
}

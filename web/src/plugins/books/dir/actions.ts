// ディレクトリ構成図のアクション: 中身を足す（id の無い入れ子で受け、全部に id を振って返す）・パスの並びから組み立てる・名前と色を替える（根も）・
// 中身ごと消す（根は消せない）・中身ごとほかのフォルダへ移す（付け替えと並びの入れ替え）・フォルダを開け閉めする・フォルダの直下を名前で並べる。
// ページのフィールド root を書き換える。書き換えた行が紙に入らなければ断る。ディレクトリ構成図の見せ方について来る
import { z } from "zod"
import { type CoreCatalog, type PagedBook, putPage } from "../../../plugin-api"
import { contentIdMaker } from "../../base"
import { addEntries, buildPaths, changeEntry, moveEntry, removeEntry, setClosed, sortFolder } from "./edit"
import { type DirFolder, DirFolderSchema, EntryColorSchema, giveIds, NewEntrySchema } from "./entry"
import { dirFits } from "./fit"
import { kit } from "./kit"

const ON_DIRS = { presentations: [kit.name("dir")] }

// ページ page の根と、根を替えたブックを作る関数（ディレクトリ構成図のページでなければ null）
function dirOf(book: PagedBook, page: string, catalog: CoreCatalog) {
  const found = book.pages.find(p => p.id === page)
  if (!found || !("root" in found)) return null
  const root = DirFolderSchema.safeParse(found.root)
  if (!root.success) return null
  return {
    root: root.data,
    put: (next: DirFolder) => {
      const written = { ...found, root: next }
      return dirFits(catalog, written, next) ? putPage(book, written) : null
    },
  }
}

const PAGE = z.string().min(1)

export const ENTRY_ADD = kit.defineAction({
  id: "entry-add",
  attach: ON_DIRS,
  aiDescription:
    "Add folders and files to a directory page, in the folder parent (the root's id for its top level), at index among its contents (the end without it). entries are nested (write no ids; only folders have children and closed); every entry gets an id, returned in entries in the same nesting. Refused if the page is not a directory page, parent is not a folder in it, index is past the end, or the rows would not fit on the paper.",
  title: "Add entries",
  target: "book",
  args: z.strictObject({
    page: PAGE,
    parent: z.string().min(1),
    index: z.number().int().min(0).optional(),
    entries: z.array(NewEntrySchema).min(1),
  }),
  permissionScope: { page: "page" },
  run: (book, args, ctx) => {
    if (!("pages" in book)) return null
    const dir = dirOf(book, args.page, ctx.catalog)
    if (!dir) return null
    const given = giveIds(args.entries, contentIdMaker(book, ctx.newId))
    const next = addEntries(dir.root, args.parent, given.entries, args.index)
    const written = next && dir.put(next)
    return written && { next: written, result: { entries: given.ids } }
  },
})

export const PATHS_ADD = kit.defineAction({
  id: "paths-add",
  attach: ON_DIRS,
  aiDescription:
    "Build folders and files on a directory page from paths, such as a listing of a real folder. Each path is relative to the folder parent (the root's id for its top level) and split by /; a path ending in / is a folder, any other is a file, and the parts before the last are folders. A folder or file already there with the same name (marks removed) and kind is used instead of adding another, so the same paths twice add nothing; new ones go at the end of their folder. Returns ids: the id each path points at, in the order of paths. Refused if parent is not a folder in the page, a path is empty, or the rows would not fit on the paper.",
  title: "Add paths",
  target: "book",
  args: z.strictObject({
    page: PAGE,
    parent: z.string().min(1),
    paths: z.array(z.string().min(1)).min(1),
  }),
  permissionScope: { page: "page" },
  run: (book, args, ctx) => {
    if (!("pages" in book)) return null
    const dir = dirOf(book, args.page, ctx.catalog)
    const built = dir && buildPaths(dir.root, args.parent, args.paths, contentIdMaker(book, ctx.newId))
    const written = built && dir?.put(built.root)
    return written ? { next: written, result: { ids: built.ids } } : null
  },
})

export const ENTRY_UPDATE = kit.defineAction({
  id: "entry-update",
  attach: ON_DIRS,
  aiDescription:
    "Change a folder or file of a directory page (the root too): its name and its color (a palette name or #rrggbb; null for the theme's color). Only what is given changes. Returns nothing. Refused for an entry not in the page or when the rows would not fit on the paper.",
  title: "Update entry",
  target: "book",
  args: z.strictObject({
    page: PAGE,
    entry: z.string().min(1),
    name: z.string().optional(),
    color: EntryColorSchema.nullable().optional(),
  }),
  permissionScope: { page: "page" },
  run: (book, args, ctx) => {
    if (!("pages" in book)) return null
    const dir = dirOf(book, args.page, ctx.catalog)
    const next = dir && changeEntry(dir.root, args.entry, { name: args.name, color: args.color })
    const written = next && dir?.put(next)
    return written ? { next: written, result: {} } : null
  },
})

export const ENTRY_REMOVE = kit.defineAction({
  id: "entry-remove",
  attach: ON_DIRS,
  aiDescription:
    "Remove a folder or file of a directory page, with everything in it. Returns nothing. Refused for the root or an entry not in the page.",
  title: "Remove entry",
  target: "book",
  args: z.strictObject({ page: PAGE, entry: z.string().min(1) }),
  permissionScope: { page: "page" },
  run: (book, args, ctx) => {
    if (!("pages" in book)) return null
    const dir = dirOf(book, args.page, ctx.catalog)
    const next = dir && removeEntry(dir.root, args.entry)
    const written = next && dir?.put(next)
    return written ? { next: written, result: {} } : null
  },
})

export const ENTRY_MOVE = kit.defineAction({
  id: "entry-move",
  attach: ON_DIRS,
  aiDescription:
    "Move a folder or file of a directory page, with everything in it, into the folder parent (the root's id for its top level) at index among its contents counted without the moved entry (the end without it). Use it to move an entry to another folder or reorder a folder's contents. Returns nothing. Refused for the root, an entry or parent not in the page, a parent that is a file or inside the moved entry, index past the end, or when the rows would not fit on the paper.",
  title: "Move entry",
  target: "book",
  args: z.strictObject({
    page: PAGE,
    entry: z.string().min(1),
    parent: z.string().min(1),
    index: z.number().int().min(0).optional(),
  }),
  permissionScope: { page: "page" },
  run: (book, args, ctx) => {
    if (!("pages" in book)) return null
    const dir = dirOf(book, args.page, ctx.catalog)
    const next = dir && moveEntry(dir.root, args.entry, args.parent, args.index)
    const written = next && dir?.put(next)
    return written ? { next: written, result: {} } : null
  },
})

export const FOLDER_CLOSE = kit.defineAction({
  id: "folder-close",
  attach: ON_DIRS,
  aiDescription:
    "Close a folder of a directory page (the root too), hiding its contents, or open it with closed false. Everyone sees it the same way. Returns nothing. Refused for a file, an entry not in the page, or when opening it would not fit on the paper.",
  title: "Open or close folder",
  target: "book",
  args: z.strictObject({ page: PAGE, folder: z.string().min(1), closed: z.boolean() }),
  permissionScope: { page: "page" },
  run: (book, args, ctx) => {
    if (!("pages" in book)) return null
    const dir = dirOf(book, args.page, ctx.catalog)
    const next = dir && setClosed(dir.root, args.folder, args.closed)
    const written = next && dir?.put(next)
    return written ? { next: written, result: {} } : null
  },
})

export const FOLDER_SORT = kit.defineAction({
  id: "folder-sort",
  attach: ON_DIRS,
  aiDescription:
    "Sort the direct contents of a folder of a directory page (the root too) by name once: folders first, then files, each ascending (asc) or descending (desc). Names compare without marks and case, numbers by value. Folders inside keep their own order. Returns nothing. Refused for a file or an entry not in the page.",
  title: "Sort folder",
  target: "book",
  args: z.strictObject({ page: PAGE, folder: z.string().min(1), order: z.enum(["asc", "desc"]) }),
  permissionScope: { page: "page" },
  run: (book, args, ctx) => {
    if (!("pages" in book)) return null
    const dir = dirOf(book, args.page, ctx.catalog)
    const next = dir && sortFolder(dir.root, args.folder, args.order)
    const written = next && dir?.put(next)
    return written ? { next: written, result: {} } : null
  },
})

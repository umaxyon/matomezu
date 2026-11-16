// ページを足す: ブックの並びに、タイプ・名前・紙を決めたページを足す。紙と向きはタイプの規定（paperChoices）の中から選ぶ。
// まとまるタイプ（grouping が own-folder。スライド）のページは、そのタイプのフォルダの中に足す: into に、入れるフォルダか、新しく作るフォルダの名前を書く。
// タイプがページに足したフィールド（fields。page-fields.ts）と、ページの設定の項目（settings。plugins/base/book-settings.ts）も一緒に決められる
// （タイプのフィールドで要るものを渡さなければ、ブックのデータの形に合わず断られる）。フィールドの受け方が結果を返せば、結果の fields に入れて返す。
// 足したページにタイプが問題を知らせれば断る（page-problems.ts）
import { z } from "zod"
import {
  addFolder,
  addPage,
  findFolder,
  findPage,
  freeTitle,
  lineupIds,
  lineupOf,
  newPage,
  type PageInto,
  pagesIn,
  putPage,
  withSettings,
} from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import { GROW_CHOICES, ORIENTATIONS } from "../../../core/def/paper"
import { translate } from "../../../core/i18n/i18n"
import { freshPageId } from "../../../core/ids"
import type { ItemPage } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { settingsArgs, settingsPatchOf, settleBook } from "../book-settings"
import { kit } from "../kit"
import { fieldsArgs, writeFields } from "./page-fields"
import { pageProblems } from "./page-problems"
import { canChoose, defaultPaper, growsValue, paperChoices } from "./pages"

// 足すページの引数（book-create も、最初のページに同じ引数を受ける）
export const NEW_PAGE_ARGS = z.strictObject({
  type: z.string().min(1), // ページのタイプの id
  title: z.string().trim().min(1).optional(), // ページの名前。無ければ「（無題）」（今の言語で）
  paper: z.string().min(1).optional(), // 紙の id。無ければ規定の既定
  orientation: z.enum(ORIENTATIONS).optional(), // 無ければ規定の既定
  grows: z.union([z.boolean(), z.enum(GROW_CHOICES)]).optional(), // 可変ページにするか、選んだ増やす向き（pages.ts の growsValue）。無ければ可変ページでない
  settings: z.record(z.string(), z.unknown()).optional(), // タイプが選んだページの設定の項目（形はタイプが決める）
  fields: z.record(z.string(), z.unknown()).optional(), // タイプがページに足したフィールド（形はタイプが決める）
  // まとまるタイプのページを入れる所: 今あるフォルダ（folder はその id）か、新しく作るフォルダ（newFolder はその名前）。まとまらないタイプは書かない
  into: z
    .union([z.strictObject({ folder: z.string().min(1) }), z.strictObject({ newFolder: z.string().trim().min(1) })])
    .optional(),
  // 入れる所（足す前の並びで、その番号の前。無ければ最後）。フォルダに入れるページはフォルダの中の番号、新しいフォルダと、まとまらないタイプのページはブックの並びの番号
  index: z.number().int().min(0).optional(),
})
export type NewPageArgs = z.infer<typeof NEW_PAGE_ARGS>

// AI に見せる、足すページの引数の形（settings と fields は、タイプごとの形のどれか）
export const describeNewPage = (catalog: CoreCatalog) =>
  NEW_PAGE_ARGS.extend({ settings: settingsArgs(catalog).optional(), fields: fieldsArgs(catalog, "add").optional() })

// 足したページの結果: ページの id、新しく作ったフォルダの id、フィールドの受け方の返した結果
export interface NewPageResult {
  page: string
  folder?: string
  fields?: unknown
}

// ブック book に、引数 args のページを足したブックと、足したページの id（と、フィールドの受け方の返した結果・新しく作ったフォルダの id）。足せなければ null
export function withNewPage(
  catalog: CoreCatalog,
  book: Book,
  args: NewPageArgs,
  ctx: { lang: string; newId: () => string },
): { book: Book; result: NewPageResult } | null {
  const type = catalog.pageTypes.get(args.type)
  if (!type) return null
  // 入れる所: まとまるタイプは into が要り、まとまらないタイプは into を書けない
  if ((type.grouping === "own-folder") !== (args.into !== undefined)) return null
  const folder = args.into && "folder" in args.into ? findFolder(book, args.into.folder) : undefined
  if (args.into && "folder" in args.into && folder?.pageType !== type.id) return null
  const size = folder ? pagesIn(book, folder.id).length : args.into ? 0 : lineupOf(book).length
  const at = args.into && "newFolder" in args.into ? undefined : args.index
  if (at !== undefined && at > size) return null
  if (args.into && "newFolder" in args.into && args.index !== undefined && args.index > lineupOf(book).length)
    return null
  const place = folder ? { folder: folder.id } : args.into ? "new-folder" : "lineup"
  const fallback = defaultPaper(catalog, book, type.id, place)
  const choice = { paper: args.paper ?? fallback.paper, orientation: args.orientation ?? fallback.orientation }
  if (!canChoose(paperChoices(catalog, book, type.id, place), choice)) return null
  const grows = growsValue(catalog, type.id, args.grows ?? false)
  if (grows === null) return null
  const settings = args.settings === undefined ? null : settingsPatchOf(catalog, type.id)?.safeParse(args.settings)
  if (settings === undefined || settings?.success === false) return null
  // 名前は、同じ入れ物の中で重ならない（渡した名前が重なれば、並びの決まりで断られる。渡さなければ、重ならない「（無題）」）
  const siblings = folder ? pagesIn(book, folder.id) : args.into ? [] : lineupOf(book)
  const title =
    args.title ??
    freeTitle(
      translate(catalog.messages, ctx.lang as never, kit.message("Untitled")),
      siblings.map(e => e.title),
    )
  const fresh = newPage(book, { type: type.id, title, ...choice, ...(grows === undefined ? {} : { grows }) }, ctx.newId)
  // 新しいフォルダの id は、足すページとも、ブックのほかの id とも重ならない
  const made =
    args.into && "newFolder" in args.into
      ? {
          kind: "folder" as const,
          id: freshPageId(ctx.newId, [...lineupIds(book), fresh.id]),
          title: args.into.newFolder,
          pageType: type.id,
          lineup: [],
        }
      : undefined
  const into: PageInto = made ? { folder: made.id } : folder ? { folder: folder.id, index: at } : { index: at }
  const based = made ? addFolder(book, made, args.index) : book
  const placed = addPage(based, fresh as ItemPage, clean(into))
  const written = writeFields(catalog, placed, fresh, args.fields, "add", ctx.newId)
  if (!written) return null
  const next = settings
    ? settleBook(
        catalog,
        putPage(placed, withSettings(written.page, settings.data as Record<string, unknown>) as ItemPage),
      )
    : putPage(placed, written.page as ItemPage)
  if (!findPage(next, fresh.id) || pageProblems(catalog, next, [fresh.id]).length > 0) return null
  return {
    book: next,
    result: {
      page: fresh.id,
      ...(made ? { folder: made.id } : {}),
      ...(written.result === undefined ? {} : { fields: written.result }),
    },
  }
}

// index が無ければ、フィールドを持たない形にする（exactOptionalPropertyTypes のため）
const clean = (into: { folder?: string; index?: number | undefined }): PageInto => {
  const index = into.index === undefined ? {} : { index: into.index }
  return into.folder === undefined ? index : { folder: into.folder, ...index }
}

export const PAGE_ADD = kit.defineAction({
  id: "page-add",
  attach: { books: true },
  aiDescription:
    'Add a page to a book. type is one of the page types (pageTypes in actions); title is "Untitled" without it. Paper and orientation default to the page type\'s. A page type whose grouping is own-folder (pageTypes in actions) keeps its pages in folders of that type, shown as one tab: give into, either { folder } (the id of a folder of that type in the book; read_book shows them) or { newFolder } (the title of a new folder, made with the page in it); a type whose grouping is none takes no into. With grows, the page grows by whole papers as its contents need, instead of keeping to one paper: the page type\'s grows in actions lists the ways a user picks from (right-down, right, down or all; true takes the first), or is "by-type" when the page type decides the ways itself (give true), "always" when every page always grows (give no grows), or "none" when its pages cannot grow. A page that grows left or up keeps one blank paper left of or above its contents: putting something there shifts all its contents right or down by whole papers (and an emptied first paper is closed up), so positions change; the result\'s notice says so. fields are the page\'s own fields its page type adds (required ones must be given), settings the page settings it has. Returns the new page\'s id (and folder, the id of the folder it made), and in fields what the page type returns for its fields (such as the ids it gave). With index the page goes before the entry at that index (the end without it; refused past the end): the index is in the folder for a page put into a folder, and in the book\'s lineup for a new folder or a page outside folders.',
  title: "Add page",
  target: "book",
  permissionScope: { creates: "type" },
  args: NEW_PAGE_ARGS,
  describeArgs: describeNewPage,
  run: (book, args, ctx) => {
    const done = withNewPage(ctx.catalog, book, args, ctx)
    return done && { next: done.book, result: done.result }
  },
})

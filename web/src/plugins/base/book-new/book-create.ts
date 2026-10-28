// ブックを作る: 何冊も作れるタイプの空のブックを、ブックの一覧に足す。機能台帳に無いタイプと、1 冊だけのタイプは断る。
// ブックの設定の項目（settings）も一緒に決められる（タイプが選んだ項目だけ。確かめと整え方は book-update と同じ withBookSettings）。
// ブックを作るダイアログが聞く項目は、タイプが createSettings で選ぶ（定義オブジェクトの拡張ポイントに書き足す）
import { z } from "zod"
import { creatableTypes, createBook } from "../../../core/book"
import type { BookTypeId, SingleBookTypeId } from "../../../core/catalog"
import { bookType, type CatalogCheck } from "../../../core/core-catalog"
import { problem } from "../../../core/errors"
import { withBookSettings } from "../book-look"
import { settingsArgs } from "../book-settings"
import { kit } from "../kit"

// 何冊も作れるブックのタイプの id（core/catalog.ts の BookTypeTable から決まる。表に無いタイプは run が断る）
type ManyBookTypeId = Exclude<BookTypeId, SingleBookTypeId>

const ARGS = z.strictObject({
  title: z.string().trim().min(1),
  type: z.custom<ManyBookTypeId>(v => typeof v === "string" && v.length > 0),
  settings: z.record(z.string(), z.unknown()).optional(), // ブックのタイプが選んだブックの設定の項目（形はタイプが決める）
})

declare module "../../../core/catalog" {
  interface BookTypeExtras {
    createSettings?: readonly string[] // ブックを作るダイアログで聞く、ブックの設定の項目の id（タイプが選んだ項目のうち）
  }
}

export const BOOK_CREATE = kit.defineAction({
  id: "book-create",
  aiDescription:
    "Create a book. type is one of the book types that are creatable (bookTypes in actions); settings are its book settings, the ones its type has. Returns the new book's id.",
  title: "New book",
  target: "library",
  args: ARGS,
  // AI には、作れるタイプの id を選ぶ形で見せる
  describeArgs: catalog => {
    const [first, ...rest] = creatableTypes(catalog)
    const settings = settingsArgs(catalog, "book").optional()
    return first ? ARGS.extend({ type: z.enum([first, ...rest]), settings }) : ARGS.extend({ settings })
  },
  run: (library, args, ctx) => {
    if (!creatableTypes(ctx.catalog).includes(args.type)) return null
    const made = createBook(ctx.catalog, args.type, { id: ctx.newId(), title: args.title })
    const book = args.settings === undefined ? made : withBookSettings(ctx.catalog, made, args.settings)
    if (!book) return null
    if (book.id in library) return null
    return { next: { ...library, [book.id]: book }, result: { book: book.id } }
  },
})

// タイプの createSettings が、そのタイプのブックの設定の項目を名指しているか（組み立てのときの確かめ）
export const CREATE_SETTINGS_CHECK: CatalogCheck = catalog =>
  [...catalog.bookTypes.values()].flatMap(t =>
    (t.createSettings ?? []).flatMap(setting =>
      (bookType(catalog, t.id).settings?.book ?? []).includes(setting) ? [] : [problem("E035", { id: t.id, setting })],
    ),
  )

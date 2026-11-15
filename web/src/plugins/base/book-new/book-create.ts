// ブックを作る: タイプの空のブックを、ブックの一覧に足す。機能台帳に無いタイプは断る。
// ブックの設定の項目（settings）も一緒に決められる（タイプが選んだ項目だけ。確かめと整え方は book-update と同じ withBookSettings）。
// ブックを作るダイアログが聞く項目は、タイプが createSettings で選ぶ（定義オブジェクトの拡張ポイントに書き足す）
import { z } from "zod"
import { creatableTypes, createBook } from "../../../core/book"
import type { PageTypeId } from "../../../core/catalog"
import { type CatalogCheckDef, pageType } from "../../../core/core-catalog"
import { problem } from "../../../core/errors"
import { type PermitContext, permittedIn, type World } from "../../../core/perform"
import { withBookSettings } from "../book-look"
import { settingsArgs } from "../book-settings"
import { kit } from "../kit"

const ARGS = z.strictObject({
  title: z.string().trim().min(1),
  type: z.custom<PageTypeId>(v => typeof v === "string" && v.length > 0),
  settings: z.record(z.string(), z.unknown()).optional(), // ブックのタイプが選んだブックの設定の項目（形はタイプが決める）
})

declare module "../../../core/catalog" {
  interface PageTypeExtras {
    createSettings?: readonly string[] // ブックを作るダイアログで聞く、ブックの設定の項目の id（タイプが選んだ項目のうち）
  }
}

export const BOOK_CREATE = kit.defineAction({
  id: "book-create",
  aiDescription:
    "Create a book. type is one of the book types that are creatable (pageTypes in actions); settings are its book settings, the ones its type has. Returns the new book's id.",
  title: "New book",
  target: "library",
  permissionScope: { create: "type" },
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

// タイプの createSettings が、そのタイプのブックの設定の項目を名指しているか（台帳アセンブルのときの確かめ）
export const CREATE_SETTINGS_CHECK: CatalogCheckDef = catalog =>
  [...catalog.pageTypes.values()].flatMap(t =>
    (t.createSettings ?? []).flatMap(setting =>
      (pageType(catalog, t.id).settings?.book ?? []).includes(setting) ? [] : [problem("E035", { id: t.id, setting })],
    ),
  )

// world で今作れるタイプ: 作れるタイプのうち、book-create を行えるもの（認可ステップがタイプごとに止めることもある）。
// 問うのは引数の形を通すためで、名前はタイプの判断に関わらないので、問うためだけの名前で問う
export const typesToCreate = (world: World, ctx: PermitContext): string[] =>
  creatableTypes(ctx.catalog).filter(
    type => permittedIn(world, BOOK_CREATE.id, { title: "-", type }, undefined, ctx).ok,
  )

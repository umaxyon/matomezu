// ブックを変える: アクション book.update（ブックの名前と、見た目のテーマと紙の色。見た目は core/theme の BookLook）と、
// ブックのタイプが足す設定の項目（settings。core/book-settings.ts）。使えるのは、見た目の項目を形に持つブックのタイプだけ（そのタイプが許す）
import { z } from "zod"
import { settingsArgs, settingsPatchOf, withSettings } from "../../../core/book-settings"
import { HEX } from "../../../core/color"
import { defineAction } from "../../../core/def/action"
import { bookType } from "../../../core/registry"
import type { Book } from "../../../core/schema/book"
import type { BookLook } from "../../../core/theme"

const ARGS = z.strictObject({
  title: z.string().trim().min(1).optional(),
  theme: z.string().min(1).nullable().optional(),
  paperColor: z.string().regex(HEX).nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(), // ブックのタイプが足す項目（形はタイプが決める）
})

// 渡した項目だけを変える。名前は前後の空白を除いて 1 字以上（空にはできない）。null は見た目の項目を消す（テーマはブックのタイプのテーマ、紙の色はテーマの紙の色に戻る）。表に無いテーマは断る。
// settings はブックのタイプが宣言した項目だけ（形に合わない・宣言の無いタイプなら断る。null は消す）。変えたらタイプの settle で整える
export const BOOK_UPDATE = defineAction({
  id: "book.update",
  title: "Change book",
  target: "book",
  needs: [],
  args: ARGS,
  describeArgs: reg => ARGS.extend({ settings: settingsArgs(reg, "book").optional() }),
  run: (book, args, ctx) => {
    if (args.theme != null && !ctx.registry.themes.has(args.theme)) return null
    if (args.title !== undefined && !("title" in book)) return null // 名前を持たないブック
    const next: Book & BookLook = args.title === undefined ? { ...book } : ({ ...book, title: args.title } as Book)
    for (const key of ["theme", "paperColor"] as const) {
      const value = args[key]
      if (value === null) delete next[key]
      else if (value !== undefined) next[key] = key === "paperColor" ? value.toLowerCase() : value
    }
    if (args.settings === undefined) return { next, result: null }
    const patch = settingsPatchOf(ctx.registry, book, "book")?.safeParse(args.settings)
    if (!patch?.success) return null
    const settle = bookType(ctx.registry, book.type).settings?.settle
    const changed = withSettings<Book>(next, patch.data as Record<string, unknown>)
    return { next: settle ? (settle(changed, ctx.registry) as Book) : changed, result: null }
  },
})

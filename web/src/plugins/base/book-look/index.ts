// ブックを変える: アクション book.update（ブックの名前と、見た目のテーマと紙の色。見た目は core/theme の BookLook）。
// 使えるのは、見た目の項目を形に持つブックのタイプだけ（そのタイプが許す）
import { z } from "zod"
import { HEX } from "../../../core/color"
import { defineAction } from "../../../core/def/action"
import type { Book } from "../../../core/schema/book"
import type { BookLook } from "../../../core/theme"

// 渡した項目だけを変える。名前は前後の空白を除いて 1 字以上（空にはできない）。null は見た目の項目を消す（テーマはブックのタイプのテーマ、紙の色はテーマの紙の色に戻る）。表に無いテーマは断る
export const BOOK_UPDATE = defineAction({
  id: "book.update",
  title: "Change book",
  target: "book",
  needs: [],
  args: z.strictObject({
    title: z.string().trim().min(1).optional(),
    theme: z.string().min(1).nullable().optional(),
    paperColor: z.string().regex(HEX).nullable().optional(),
  }),
  run: (book, args, ctx) => {
    if (args.theme != null && !ctx.registry.themes.has(args.theme)) return null
    if (args.title !== undefined && !("title" in book)) return null // 名前を持たないブック
    const next: Book & BookLook = args.title === undefined ? { ...book } : ({ ...book, title: args.title } as Book)
    for (const key of ["theme", "paperColor"] as const) {
      const value = args[key]
      if (value === null) delete next[key]
      else if (value !== undefined) next[key] = key === "paperColor" ? value.toLowerCase() : value
    }
    return { next, result: null }
  },
})

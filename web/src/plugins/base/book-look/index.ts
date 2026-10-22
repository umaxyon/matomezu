// ブックの見た目を変える: アクション book.update（テーマと紙の色。core/theme の BookLook）。使えるのは、見た目の項目を形に持つブックのタイプだけ（そのタイプが許す）
import { z } from "zod"
import { HEX } from "../../../core/color"
import { defineAction } from "../../../core/def/action"
import type { Book } from "../../../core/schema/book"
import type { BookLook } from "../../../core/theme"

// 渡した項目だけを変える。null は項目を消す（テーマはブックのタイプのテーマ、紙の色はテーマの紙の色に戻る）。表に無いテーマは断る
export const BOOK_UPDATE = defineAction({
  id: "book.update",
  title: "Change book",
  target: "book",
  needs: [],
  args: z.strictObject({
    theme: z.string().min(1).nullable().optional(),
    paperColor: z.string().regex(HEX).nullable().optional(),
  }),
  run: (book, args, ctx) => {
    if (args.theme != null && !ctx.registry.themes.has(args.theme)) return null
    const next: Book & BookLook = { ...book }
    for (const key of ["theme", "paperColor"] as const) {
      const value = args[key]
      if (value === null) delete next[key]
      else if (value !== undefined) next[key] = key === "paperColor" ? value.toLowerCase() : value
    }
    return { next, result: null }
  },
})

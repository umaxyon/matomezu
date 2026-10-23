// ブックを変える: ブックの設定のダイアログと、それを開くコマンド。アクション book.update（ブックの名前と、見た目のテーマと紙の色。見た目は core/theme の BookLook）と、
// ブックのタイプが選んだ設定の項目（settings。core/book-settings.ts）。使えるのは、見た目の項目を形に持つブックのタイプだけ（そのタイプが許す）
import { z } from "zod"
import { settingsArgs, settingsPatchOf, settleBook, withSettings } from "../../../core/book-settings"
import { HEX } from "../../../core/color"
import { defineAction } from "../../../core/def/action"
import { actionsOf } from "../../../core/perform"
import type { Book } from "../../../core/schema/book"
import type { BookLook } from "../../../core/theme"
import { defineCommand } from "../../../store/commands/def"
import { defineDialog } from "../../../store/dialogs"

const ARGS = z.strictObject({
  title: z.string().trim().min(1).optional(),
  theme: z.string().min(1).nullable().optional(),
  paperColor: z.string().regex(HEX).nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(), // ブックのタイプが足す項目（形はタイプが決める）
})

// 渡した項目だけを変える。名前は前後の空白を除いて 1 字以上（空にはできない）。null は見た目の項目を消す（テーマはブックのタイプのテーマ、紙の色はテーマの紙の色に戻る）。表に無いテーマは断る。
// settings はブックのタイプが選んだ項目だけ（形に合わない・選んでいないタイプなら断る。null は消す）。変えたらページを整える（settleBook）
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
    return {
      next: settleBook(ctx.registry, withSettings<Book>(next, patch.data as Record<string, unknown>)),
      result: null,
    }
  },
})

export const BOOK_SETTINGS_DIALOG = defineDialog({ id: "book.settings" })

// ブックの設定のダイアログを開く（ブックのタイプが book.update を使える、名前と見た目を変えられるブックだけ）
export const BOOK_SETTINGS = defineCommand({
  id: "book.settings",
  title: "Book settings",
  run: (ctx, a) => a.openDialog(ctx.stage.id, "book.settings"),
  when: ctx => ctx.book !== null && actionsOf(ctx.registry, ctx.book).includes("book.update"),
})

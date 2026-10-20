// アクションを行う、ブックのデータを変える入口。ブックで使えるアクションかと引数の形を確かめてから run する
import type { ActionContext } from "./def/action"
import { actionDef, bookType } from "./registry"
import type { Book } from "./schema/book"

export type Performed = { ok: true; book: Book } | { ok: false; reason: "unknown" | "not-allowed" | "bad-args" }

// ブックで使えるアクション（タイプの既定）
export function actionsOf(book: Book): readonly string[] {
  return bookType(book.type).actions.defaults
}

export function perform(book: Book, id: string, args: unknown, ctx: ActionContext): Performed {
  const action = actionDef(id)
  if (!action) return { ok: false, reason: "unknown" }
  if (!actionsOf(book).includes(id)) return { ok: false, reason: "not-allowed" }
  const parsed = action.args.safeParse(args)
  if (!parsed.success) return { ok: false, reason: "bad-args" }
  return { ok: true, book: action.run(book, parsed.data, ctx) }
}

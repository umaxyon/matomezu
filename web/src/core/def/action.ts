// アクションの定義: できること（動詞）。ブックのデータを変える入口はアクションだけで、画面の操作も LLM の操作も同じものを通る。
// run は新しい値を返す純粋な関数（変わらなければ同じ値を返す）
import type { z } from "zod"
import type { Lang, MessageKey } from "../i18n/i18n"
import type { Book } from "../schema/book"
import type { Capability } from "./item"

// 何に対して使うか
export type ActionTarget = "book" | "page" | "item" | "selection"

export interface ActionContext {
  lang: Lang
}

export interface ActionDef<A = unknown> {
  id: string // 「対象.動き」（例: page.add）
  title: MessageKey
  target: ActionTarget
  needs: readonly Capability[] // 対象のアイテムに求める能力
  args: z.ZodType<A> // 引数の形（LLM にもこの形で見せる）
  run(book: Book, args: A, ctx: ActionContext): Book
}

// args の形から run の引数の型を決め、id は書いた文字のまま残す
export function defineAction<const Id extends string, A>(def: ActionDef<A> & { id: Id }): ActionDef<A> & { id: Id } {
  return def
}

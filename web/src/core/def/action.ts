// アクションの定義: できること（動詞）。データを変える入口はアクションだけで、画面の操作も LLM の操作も同じものを通る。
// run は新しい値と結果（作ったものの id など）を返す純粋な関数。対象に合わなければ null を返して断る
import type { z } from "zod"
import type { Lang, MessageKey } from "../i18n/i18n"
import type { Library } from "../library"
import type { Registry } from "../registry"
import type { Book } from "../schema/book"
import type { Capability } from "./item"

// 対象ごとの、アクションが受け取って返すデータ。library はブックの一覧で、使えるかはホームのブックのタイプが決める
export interface Subjects {
  library: Library
  book: Book
}

export type ActionTarget = keyof Subjects

export interface ActionContext {
  registry: Registry // 使う登録表（アクション・ブックのタイプ・紙など）
  home: string | null // app のホームのブックの id（一覧のアクションを許すかは、このブックのタイプが決める）。無ければ一覧のアクションは断る
  lang: Lang
  newId(): string // ブックなど、ほかの世界と行き来するものの id を振る
}

export interface Done<T extends ActionTarget, R> {
  next: Subjects[T]
  result: R
}

export interface ActionDef<T extends ActionTarget = ActionTarget, A = unknown, R = unknown> {
  id: string // 「対象.動き」（例: page.add）
  title: MessageKey
  target: T
  needs: readonly Capability[] // 対象のアイテムに求める能力
  args: z.ZodType<A> // 引数の形（LLM にもこの形で見せる）
  run(subject: Subjects[T], args: A, ctx: ActionContext): Done<T, R> | null
}

// target から run の対象の型を、args の形から引数の型を決め、id は書いた文字のまま残す
export function defineAction<const Id extends string, T extends ActionTarget, A, R>(
  def: ActionDef<T, A, R> & { id: Id },
): ActionDef<T, A, R> & { id: Id } {
  return def
}

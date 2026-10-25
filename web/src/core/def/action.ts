// アクションの定義: できること（動詞）。データを変える入口はアクションだけで、画面の操作も LLM の操作も同じものを通る。
// run は新しい値と結果（作ったものの id など）を返す純粋な関数。対象に合わなければ null を返して断る
import type { z } from "zod"
import type { CoreCatalog } from "../core-catalog"
import type { Lang, MessageKey } from "../i18n/i18n"
import type { Library } from "../library"
import type { Book } from "../schema/book"
import type { Settings } from "../settings"
import type { Capability } from "./item"

// 対象ごとの、アクションが受け取って返すデータ。library はブックの一覧、settings は見る人ごとの設定で、
// この 2 つのアクションを使えるかはホームのブックのタイプが決める
export interface Subjects {
  library: Library
  book: Book
  settings: Settings
}

export type ActionTarget = keyof Subjects

export interface ActionContext {
  catalog: CoreCatalog // 使う機能台帳（アクション・ブックのタイプ・紙など）
  home: string | null // インスタンスのホームのブックの id（一覧と設定のアクションを許すかは、このブックのタイプが決める）。無ければ断る
  lang: Lang
  newId(): string // ブック・ページ・アイテムの id のもとを振る（重ならない値。行い直すときは、先に行ったときと同じ値を同じ順に返す）
  // 行った時点（UTC の ISO 8601。例 2026-10-26T03:04:05.678Z）。最初に行った所（画面、AI ならホスト）が 1 回だけ決め、行い直しでも同じ値。
  // アクションは時刻や乱数を直に使わず、これと newId だけを使う（同じ入力なら同じ結果）
  now: string
}

export interface Done<T extends ActionTarget, R> {
  next: Subjects[T]
  result: R
}

// A は引数の形を通した後の値、I は渡す値（ArgsOf はこちら。省いてよい項目は I で省ける）
export interface ActionDef<T extends ActionTarget = ActionTarget, A = unknown, R = unknown, I = unknown> {
  id: string // 「対象.動き」（例: page.add）
  title: MessageKey
  aiDescription: string // AI 向けの説明（英語。MCP の actions で見せる。どう変わるか・何を返すか・断る場合）
  target: T
  needs: readonly Capability[] // 対象のアイテムに求める能力
  args: z.ZodType<A, I> // 引数の形（LLM にもこの形で見せる）
  // LLM に見せる引数の形を、機能台帳から組み立てる（ブックのタイプが足す項目など。無ければ args）。受け付けるかは run が確かめる
  describeArgs?(catalog: CoreCatalog): z.ZodType
  run(subject: Subjects[T], args: A, ctx: ActionContext): Done<T, R> | null
}

// target から run の対象の型を、args の形から引数の型を決め、id は書いた文字のまま残す
export function defineAction<const Id extends string, T extends ActionTarget, A, R, I>(
  def: ActionDef<T, A, R, I> & { id: Id },
): ActionDef<T, A, R, I> & { id: Id } {
  return def
}

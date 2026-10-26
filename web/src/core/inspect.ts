// 問い合わせ: ある値や許可が、どの決まりからどの順で決まったかを返す（デバッグと AI の問い合わせに使う）。
// 口はこの inspect 1 つで、問い合わせの種類（kind）ごとに調べ方を足す。
// 段（steps）は見る順に並べ、最初に値のあった段で決まる（決まった後の段も並べる）。段の出どころは文ではなくデータで返す

import type { ActionId } from "./catalog"
import { bookType, type CoreCatalog } from "./core-catalog"
import { type ActionContext, type ActionDef, attachedTo } from "./def/action"
import type { BookTypeDef } from "./def/book-type"
import type { ThemeToken } from "./def/theme"
import { THEME_TOKENS } from "./def/theme"
import type { KeyBinding } from "./keys"
import type { Book } from "./schema/book"
import { type Shades, shades, tokenDeclsOf } from "./theme"

// 段の出どころ
export type Source =
  | { source: "theme"; id: string; field: "tokens" | "base"; key: string } // テーマの上書き・共通のテーマキー
  | { source: "token"; id: string } // テーマキーの宣言に書いた値
  | { source: "catalog"; table: "actions"; id: string } // 表にその定義があるか
  | { source: "bookType"; id: string; field: "actions.without" | "actions.add" } // ブックのタイプが外す・足すアクション
  | { source: "action"; id: string; field: "attach"; bookType: string } // アクションの付く先が、そのタイプに当てはまるか
  | { source: "home"; id: null } // ホームが無い（一覧と設定のアクションは使えない）
  // キーの割り当ての行（誰の行か・書いたプラグイン・使わなかった理由。store/keys.ts の inspectKey）
  | {
      source: "key"
      from: "user" | "builtin" | "plugin"
      plugin: string | null
      binding: KeyBinding
      dropped?: "removed" | "builtin" | "plugins"
    }

export interface Step<V> {
  from: Source
  value: V | null // その段に値が無ければ null
}

export interface Inspected<V> {
  value: V | null // 決まった値（どの段にも無ければ null）
  decidedBy: Source | null
  steps: Step<V>[]
}

export type Query =
  | { kind: "token"; book: Book; token: string } // ブックを描くテーマキーの値
  | { kind: "action"; action: string; book?: Book } // アクションを使えるか（ブックが対象のアクションは、そのブック）

type Answer<Q extends Query> = Q extends { kind: "token" } ? Inspected<Shades> : Inspected<boolean>

export function inspect<Q extends Query>(catalog: CoreCatalog, query: Q, ctx?: Pick<ActionContext, "home">): Answer<Q> {
  const answer = query.kind === "token" ? token(catalog, query) : action(catalog, query, ctx?.home ?? null)
  return answer as Answer<Q>
}

const decide = <V>(steps: Step<V>[]): Inspected<V> => {
  const hit = steps.find(s => s.value !== null)
  return { value: hit?.value ?? null, decidedBy: hit?.from ?? null, steps }
}

// テーマの値（明暗ごとの色）: 宣言されたテーマキーは テーマの上書き → 宣言の既定の共通のテーマキー、共通のテーマキーはテーマの値。どちらでもないテーマキーは値が無い
function token(catalog: CoreCatalog, q: { book: Book; token: string }): Inspected<Shades> {
  const type = bookType(catalog, q.book.type)
  const theme = catalog.themes.get(type.theme)
  if (!theme) return decide([])
  const base = (key: ThemeToken): Step<Shades> => ({
    from: { source: "theme", id: theme.id, field: "base", key },
    value: shades(theme.base[key]),
  })
  if ((THEME_TOKENS as readonly string[]).includes(q.token)) return decide([base(q.token as ThemeToken)])
  const decl = tokenDeclsOf(catalog, type).find(d => d.id === q.token)
  if (!decl) return decide([])
  const own = theme.tokens?.[decl.id]
  return decide([
    {
      from: { source: "theme", id: theme.id, field: "tokens", key: decl.id },
      value: own === undefined ? null : shades(own),
    },
    "fallback" in decl ? base(decl.fallback) : { from: { source: "token", id: decl.id }, value: shades(decl.value) },
  ])
}

// タイプ type でアクションを使えるかの段: タイプが外す（without）→ タイプが足す（add）→ アクションの付く先（attach）
export function typeSteps(def: ActionDef, type: BookTypeDef): Step<boolean>[] {
  return [
    {
      from: { source: "bookType", id: type.id, field: "actions.without" },
      value: type.actions.without?.includes(def.id as ActionId) ? false : null,
    },
    {
      from: { source: "bookType", id: type.id, field: "actions.add" },
      value: type.actions.add?.includes(def.id as ActionId) ? true : null,
    },
    { from: { source: "action", id: def.id, field: "attach", bookType: type.id }, value: attachedTo(def, type) },
  ]
}

// アクションの許可: 表にあるか → ブックが対象ならそのブックのタイプ、一覧と設定が対象ならホームのタイプで使えるか
function action(catalog: CoreCatalog, q: { action: string; book?: Book }, home: string | null): Inspected<boolean> {
  const def: ActionDef | undefined = catalog.actions.get(q.action)
  const known: Step<boolean> = {
    from: { source: "catalog", table: "actions", id: q.action },
    value: def ? null : false,
  }
  if (!def) return decide([known])
  if (def.target === "book")
    return q.book ? decide([known, ...typeSteps(def, bookType(catalog, q.book.type))]) : decide([known])
  if (home === null) return decide([known, { from: { source: "home", id: null }, value: false }])
  return decide([known, ...typeSteps(def, bookType(catalog, home))])
}

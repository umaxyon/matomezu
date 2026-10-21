// 問い合わせ: ある値や許可が、どの決まりからどの順で決まったかを返す（デバッグと AI の問い合わせに使う）。
// 口はこの inspect 1 つで、問い合わせの種類（kind）ごとに調べ方を足す。
// 段（steps）は見る順に並べ、最初に値のあった段で決まる（決まった後の段も並べる）。段の出どころは文ではなくデータで返す
import type { ActionContext, ActionDef } from "./def/action"
import type { ThemeToken } from "./def/theme"
import { THEME_TOKENS } from "./def/theme"
import { bookType, type Registry } from "./registry"
import type { Book } from "./schema/book"
import { type Shades, shades } from "./theme"

// 段の出どころ
export type Source =
  | { source: "theme"; id: string; field: "tokens" | "base"; key: string } // テーマの上書き・共通の欄
  | { source: "registry"; table: "actions"; id: string } // 表にその定義があるか
  | { source: "bookType"; id: string; field: "actions.defaults" } // ブックのタイプが使えるアクション
  | { source: "home"; id: string | null; field: "actions.defaults" } // ホームのタイプが使えるアクション（ホームが無ければ id は null）

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
  | { kind: "token"; book: Book; token: string } // ブックを描くテーマの欄の値
  | { kind: "action"; action: string; book?: Book } // アクションを使えるか（ブックが対象のアクションは、そのブック）

type Answer<Q extends Query> = Q extends { kind: "token" } ? Inspected<Shades> : Inspected<boolean>

export function inspect<Q extends Query>(reg: Registry, query: Q, ctx?: Pick<ActionContext, "home">): Answer<Q> {
  const answer = query.kind === "token" ? token(reg, query) : action(reg, query, ctx?.home ?? null)
  return answer as Answer<Q>
}

const decide = <V>(steps: Step<V>[]): Inspected<V> => {
  const hit = steps.find(s => s.value !== null)
  return { value: hit?.value ?? null, decidedBy: hit?.from ?? null, steps }
}

// テーマの値（明暗ごとの色）: 宣言された欄は テーマの上書き → 宣言の既定の共通の欄、共通の欄はテーマの値。どちらでもない欄は値が無い
function token(reg: Registry, q: { book: Book; token: string }): Inspected<Shades> {
  const type = bookType(reg, q.book.type)
  const theme = reg.themes.get(type.theme)
  if (!theme) return decide([])
  const base = (key: ThemeToken): Step<Shades> => ({
    from: { source: "theme", id: theme.id, field: "base", key },
    value: shades(theme.base[key]),
  })
  if ((THEME_TOKENS as readonly string[]).includes(q.token)) return decide([base(q.token as ThemeToken)])
  const items = type.items.defaults.flatMap(id => reg.items.get(id)?.tokens ?? [])
  const decl = [...type.tokens, ...items].find(d => d.id === q.token)
  if (!decl) return decide([])
  const own = theme.tokens?.[decl.id]
  return decide([
    {
      from: { source: "theme", id: theme.id, field: "tokens", key: decl.id },
      value: own === undefined ? null : shades(own),
    },
    base(decl.fallback),
  ])
}

// アクションの許可: 表にあるか → ブックが対象ならそのブックのタイプ、一覧と設定が対象ならホームのタイプが使えるとするか
function action(reg: Registry, q: { action: string; book?: Book }, home: string | null): Inspected<boolean> {
  const def: ActionDef | undefined = reg.actions.get(q.action)
  const known: Step<boolean> = {
    from: { source: "registry", table: "actions", id: q.action },
    value: def ? null : false,
  }
  if (!def) return decide([known])
  if (def.target === "book") {
    if (!q.book) return decide([known])
    const type = bookType(reg, q.book.type)
    const from: Source = { source: "bookType", id: type.id, field: "actions.defaults" }
    return decide([known, { from, value: type.actions.defaults.includes(def.id) }])
  }
  const from: Source = { source: "home", id: home, field: "actions.defaults" }
  const usable = home === null ? false : bookType(reg, home).actions.defaults.includes(def.id)
  return decide([known, { from, value: usable }])
}

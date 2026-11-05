// 問い合わせ: ある値や許可が、どの決まりからどの順で決まったかを返す（デバッグと AI の問い合わせに使う）。
// 口はこの inspect 1 つで、問い合わせの種類（kind）ごとに調べ方を足す。
// ステップ（steps）は見る順に並べ、最初に値のあったステップで決まる（決まった後のステップも並べる）。ステップの出どころは文ではなくデータで返す

import type { ActionId } from "./catalog"
import { bookType, type CoreCatalog } from "./core-catalog"
import { type ActionContext, type ActionDef, attachedTo, isOnBook, type Where } from "./def/action"
import type { BookTypeDef } from "./def/book-type"
import type { PermissionQuery } from "./def/permission"
import type { KeyBinding } from "./keys"
import type { Book } from "./schema/book"

// ステップの出どころ
export type Source =
  | { source: "catalog"; table: "actions"; id: string } // 表にその定義があるか
  | { source: "bookType"; id: string; field: "actions.without" | "actions.add" } // ブックのタイプが外す・足すアクション
  | { source: "action"; id: string; field: "attach"; bookType: string } // アクションの付く先が、そのタイプに当てはまるか
  | { source: "action"; id: string; field: "userOnly" } // 利用者だけが行うアクションを、AI が頼んだ
  | { source: "userSetting"; id: string; field: "userOnly" } // 利用者だけが変える利用者の設定の項目を、AI が変えようとした
  | { source: "bookType"; id: string; field: "fixedUserSettings"; setting: string } // ホームのタイプが変えさせない利用者の設定の項目
  | { source: "home"; id: null } // ホームが無い（一覧と設定のアクションは使えない）
  | { source: "permission"; id: string } // 認可ステップが止めた（core/def/permission.ts）
  // キーバインドの行（誰の行か・書いたプラグイン・使わなかった理由。store/keys.ts の inspectKey）
  | {
      source: "key"
      from: "user" | "builtin" | "plugin"
      plugin: string | null
      binding: KeyBinding
      dropped?: "removed"
    }

export interface Step<V> {
  from: Source
  value: V | null // そのステップに値が無ければ null
}

export interface Inspected<V> {
  value: V | null // 決まった値（どのステップにも無ければ null）
  decidedBy: Source | null
  steps: Step<V>[]
}

export type Query =
  // アクションを使えるか。book はアクションが変えるブック（ブックが対象のアクションは、そのブック）、where はその中の所（分からなければ無い）、by は誰が行うか。
  // 認可ステップは book があるときだけ見る。settings は、利用者の設定が対象のアクションで変える項目の id（項目ごとに見る）
  { kind: "action"; action: string; book?: Book; settings?: readonly string[] } & Pick<PermissionQuery, "where" | "by">

export function inspect(catalog: CoreCatalog, query: Query, ctx?: Pick<ActionContext, "home">): Inspected<boolean> {
  return action(catalog, query, ctx?.home ?? null)
}

// アクション action を、開いているブック book の所 where で使えるかの問い。ブックとアノテーションが対象のアクションだけ book と where を渡す
// （ほかの対象は、ホームのタイプで決まる）
export function actionQuery(catalog: CoreCatalog, action: string, book: Book | undefined, where?: Where): Query {
  const onBook = book !== undefined && isOnBook(catalog.actions.get(action)?.target)
  return { kind: "action", action, ...(onBook ? { book, ...(where ? { where } : {}) } : {}) }
}

const decide = <V>(steps: Step<V>[]): Inspected<V> => {
  const hit = steps.find(s => s.value !== null)
  return { value: hit?.value ?? null, decidedBy: hit?.from ?? null, steps }
}

// タイプ type でアクションを使えるかのステップ: タイプが外す（without）→ タイプが足す（add）→ アクションの付く先（attach）
function typeSteps(def: ActionDef, type: BookTypeDef): Step<boolean>[] {
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

// タイプ type でアクションを使えるか（typeSteps で決まる答え）
export const typeAllows = (def: ActionDef, type: BookTypeDef): boolean => decide(typeSteps(def, type)).value === true

// 認可ステップ: 表の並びで、止めるなら false（許すことはしないので、ほかは null）
function permissionSteps(catalog: CoreCatalog, q: PermissionQuery): Step<boolean>[] {
  return [...catalog.permissions.values()].map(p => ({
    from: { source: "permission", id: p.id },
    value: p.denies(q) ? false : null,
  }))
}

// 利用者の設定の項目ごとのステップ: AI が利用者だけの項目を変えるか（項目の userOnly）と、ホームのタイプが変えさせない項目か（fixedUserSettings）。
// 機能台帳に無い項目は見ない（アクションが断る）
function userSettingSteps(
  catalog: CoreCatalog,
  ids: readonly string[],
  by: PermissionQuery["by"],
  home: BookTypeDef,
): { userOnly: Step<boolean>[]; fixed: Step<boolean>[] } {
  const known = ids.filter(id => catalog.userSettings.has(id))
  return {
    userOnly: known.map(id => ({
      from: { source: "userSetting", id, field: "userOnly" },
      value: by === "ai" && catalog.userSettings.get(id)?.userOnly ? false : null,
    })),
    fixed: known.map(id => ({
      from: { source: "bookType", id: home.id, field: "fixedUserSettings", setting: id },
      value: home.fixedUserSettings?.includes(id) ? false : null,
    })),
  }
}

// アクションの許可: 表にあるか → AI が利用者だけのアクション・項目を頼んだか → 認可ステップ（ブックがあるとき）→
// ブックとアノテーションが対象ならそのブックのタイプ、一覧と設定が対象ならホームのタイプ（変えさせない項目 → アクションを使えるか）
function action(catalog: CoreCatalog, q: Extract<Query, { kind: "action" }>, home: string | null): Inspected<boolean> {
  const def: ActionDef | undefined = catalog.actions.get(q.action)
  const known: Step<boolean> = {
    from: { source: "catalog", table: "actions", id: q.action },
    value: def ? null : false,
  }
  if (!def) return decide([known])
  const userOnly: Step<boolean> = {
    from: { source: "action", id: def.id, field: "userOnly" },
    value: def.userOnly && q.by === "ai" ? false : null,
  }
  const { kind: _, action: __, book, settings, ...where } = q
  const permitted = book ? permissionSteps(catalog, { ...where, action: def, book }) : []
  if (def.target === "book" || def.target === "annotations")
    return book
      ? decide([known, userOnly, ...permitted, ...typeSteps(def, bookType(catalog, book.type))])
      : decide([known, userOnly])
  if (home === null) return decide([known, userOnly, { from: { source: "home", id: null }, value: false }])
  const type = bookType(catalog, home)
  const items = userSettingSteps(catalog, def.target === "settings" ? (settings ?? []) : [], q.by, type)
  return decide([known, userOnly, ...items.userOnly, ...permitted, ...items.fixed, ...typeSteps(def, type)])
}

// 認可ステップを除いて決めた答え（タイプなどで使えるか。認可ステップが止めているかは見ない）
export const withoutPermissions = (answer: Inspected<boolean>): Inspected<boolean> =>
  decide(answer.steps.filter(s => s.from.source !== "permission"))

// 答えを止めたのが認可ステップなら、そのステップの id（使えるか、ほかのステップが止めたなら null）
export const deniedBy = (answer: Inspected<boolean>): string | null =>
  answer.value === false && answer.decidedBy?.source === "permission" ? answer.decidedBy.id : null

// 問い合わせ: ある値や許可が、どの決まりからどの順で決まったかを返す（デバッグと AI の問い合わせに使う）。
// 口はこの inspect 1 つで、問い合わせの種類（kind）ごとに調べ方を足す。
// ステップ（steps）は見る順に並べ、最初に値のあったステップで決まる（決まった後のステップも並べる）。ステップの出どころは文ではなくデータで返す

import { type Actor, hasJoined, isAI, USER } from "./actor"
import { pagesOf } from "./book"
import type { ActionId, SubjectId } from "./catalog"
import { type CoreCatalog, pageType } from "./core-catalog"
import { type ActionContext, type ActionDef, attachedTo, BASE_TARGETS, isOnBook, type Where } from "./def/action"
import type { ControlCenterDef } from "./def/control-center"
import type { PageTypeDef } from "./def/page-type"
import type { PermissionQuery, Referred } from "./def/permission"
import type { SubjectDef } from "./def/subject"
import { idsIn } from "./ids"
import type { KeyBinding } from "./keys"
import type { Book } from "./schema/book"

// ステップの出どころ
export type Source =
  | { source: "catalog"; table: "actions"; id: string } // 表にその定義があるか
  | { source: "pageType"; id: string; field: "actions.without" | "actions.add" } // ブックのタイプが外す・足すアクション
  | { source: "action"; id: string; field: "attach"; pageType: string } // アクションの付く先が、そのタイプのページに当てはまるか
  | { source: "action"; id: string; field: "attach.books" } // アクションが、どのブックにも付くか（ページを名指さないとき）
  | { source: "action"; id: string; field: "userOnly" } // 利用者だけが行うアクションを、AI が頼んだ
  | { source: "participation"; id: string } // 参加が確定していない AI が、ブックでない対象のアクションを頼んだ
  | { source: "userSetting"; id: string; field: "userOnly" } // 利用者だけが変える利用者の設定の項目を、AI が変えようとした
  | { source: "controlCenter"; id: string; field: "actions" } // コントロールセンターが許すアクション
  | { source: "controlCenter"; id: string; field: "fixedUserSettings"; setting: string } // コントロールセンターが変えさせない利用者の設定の項目
  | { source: "controlCenter"; id: null } // コントロールセンターが無い（一覧と設定のアクションは使えない）
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
  // アクションを使えるか。book はアクションが変えるブック（ブックが対象のアクションは、そのブック）、where はその中の所（分からなければ無い）、actor は誰が行うか。
  // 認可ステップは book か record があるときに見る。settings は、利用者の設定が対象のアクションで変える項目の id（項目ごとに見る）
  {
    kind: "action"
    action: string
    book?: Book
    settings?: readonly string[]
    where?: Where
    actor: Actor
    // レコードが対象のアクションの宛先のレコード（作るなら none）と、そのレコードが指すほかのレコード。認可ステップは record があるときに見る
    record?: { record: unknown; refs: readonly Referred[] }
  }

export function inspect(
  catalog: CoreCatalog,
  query: Query,
  ctx?: Pick<ActionContext, "controlCenter">,
): Inspected<boolean> {
  return action(catalog, query, ctx?.controlCenter ?? null)
}

// アクション action を、開いているブック book の所 where で使えるかの問い。ブックとアノテーションが対象のアクションだけ book と where を渡す
// （ほかの対象は、コントロールセンターで決まる）
export function actionQuery(catalog: CoreCatalog, action: string, book: Book | undefined, where?: Where): Query {
  const onBook = book !== undefined && isOnBook(catalog.actions.get(action)?.target)
  return { kind: "action", action, actor: USER, ...(onBook ? { book, ...(where ? { where } : {}) } : {}) }
}

const decide = <V>(steps: Step<V>[]): Inspected<V> => {
  const hit = steps.find(s => s.value !== null)
  return { value: hit?.value ?? null, decidedBy: hit?.from ?? null, steps }
}

// タイプ type でアクションを使えるかのステップ: タイプが外す（without）→ タイプが足す（add）→ アクションの付く先（attach）
function typeSteps(def: ActionDef, type: PageTypeDef): Step<boolean>[] {
  return [
    {
      from: { source: "pageType", id: type.id, field: "actions.without" },
      value: type.actions.without?.includes(def.id as ActionId) ? false : null,
    },
    {
      from: { source: "pageType", id: type.id, field: "actions.add" },
      value: type.actions.add?.includes(def.id as ActionId) ? true : null,
    },
    { from: { source: "action", id: def.id, field: "attach", pageType: type.id }, value: attachedTo(def, type) },
  ]
}

// アクション def を、ブック book の所 where で使えるかのステップ。
// - 所がページを名指す（page か、ページの中の物 ids）: そのページのタイプで決める（いくつものタイプにまたがるなら、どのタイプでも使えるときだけ）
// - アノテーションが対象で所が無い: ブックのどれかのページのタイプで使えるか（結び付く物のページごとの確かめは、行った後。core/annotation.ts）
// - ほか（ブック全体が対象）: タイプに依らない付く先（attach の books）だけで決める
function placeSteps(catalog: CoreCatalog, def: ActionDef, book: Book, where: Where | undefined): Step<boolean>[] {
  const types = typesAt(catalog, def, book, where)
  if (types === null)
    return [{ from: { source: "action", id: def.id, field: "attach.books" }, value: def.attach?.books === true }]
  const [first, ...rest] = types.map(t => typeSteps(def, t))
  if (!first) return [{ from: { source: "action", id: def.id, field: "attach.books" }, value: false }]
  if (def.target === "annotations" && where === undefined)
    return [first, ...rest].find(steps => decide(steps).value === true) ?? first
  return [first, ...rest].find(steps => decide(steps).value !== true) ?? first
}

// 所 where が名指すページのタイプ（重ねずに）。ページを名指さなければ null（アノテーションが対象なら、ブックの全部のページのタイプ）
function typesAt(catalog: CoreCatalog, def: ActionDef, book: Book, where: Where | undefined): PageTypeDef[] | null {
  const pages = pagesOf(book)
  const named =
    where?.page !== undefined
      ? pages.filter(p => p.id === where.page)
      : where?.ids !== undefined
        ? pages.filter(({ id: _page, ...content }) => {
            const ids = new Set(idsIn(content))
            return where.ids?.some(id => ids.has(id))
          })
        : def.target === "annotations"
          ? pages
          : null
  // 名指したページ・物がブックに無ければ、ここでは決めない（ブック全体として問い、無い物は run が断る）
  if (named === null || (named.length === 0 && def.target !== "annotations")) return null
  return [...new Set(named.map(p => p.type))].map(t => pageType(catalog, t))
}

// タイプ type でアクションを使えるか（typeSteps で決まる答え）
export const typeAllows = (def: ActionDef, type: PageTypeDef): boolean => decide(typeSteps(def, type)).value === true

// 認可ステップ: 表の並びで、止めるなら false（許すことはしないので、ほかは null）
function permissionSteps(catalog: CoreCatalog, q: PermissionQuery): Step<boolean>[] {
  return [...catalog.permissions.values()].map(p => ({
    from: { source: "permission", id: p.id },
    value: p.denies(q) ? false : null,
  }))
}

// 参加を頼む役（AI が参加を頼むときに matomezu が行うアクション）は、参加が確定する前にも行える
const joinsWithoutParticipation = (def: ActionDef): boolean => def.runsWhenAIJoins !== undefined

// コントロールセンターが、対象の種類（対象の定義）のアクションを全部許すか
const allowsSubject = (center: ControlCenterDef, target: string): boolean =>
  center.subjects === "all" ? !BASE_TARGETS.includes(target) : (center.subjects?.includes(target as SubjectId) ?? false)

// アクションの writes の種類が全部許されているか（コントロールセンターの actions に並べたアクションも、変える別の種類は許されていなければ使えない）
const allowsWrites = (center: ControlCenterDef, def: ActionDef): boolean =>
  (def.writes ?? []).every(s => allowsSubject(center, s))

// コントロールセンターがアクションを許すかのステップ
const centerSteps = (def: ActionDef, center: ControlCenterDef): Step<boolean>[] => [
  {
    from: { source: "controlCenter", id: center.id, field: "actions" },
    value:
      (center.actions.includes(def.id as ActionId) || allowsSubject(center, def.target)) && allowsWrites(center, def)
        ? true
        : null,
  },
]

// 利用者の設定の項目ごとのステップ: AI が利用者だけの項目を変えるか（項目の userOnly）と、コントロールセンターが変えさせない項目か（fixedUserSettings）。
// 機能台帳に無い項目は見ない（アクションが断る）
function userSettingSteps(
  catalog: CoreCatalog,
  ids: readonly string[],
  actor: Actor,
  center: ControlCenterDef,
): { userOnly: Step<boolean>[]; fixed: Step<boolean>[] } {
  const known = ids.filter(id => catalog.userSettings.has(id))
  return {
    userOnly: known.map(id => ({
      from: { source: "userSetting", id, field: "userOnly" },
      value: isAI(actor) && catalog.userSettings.get(id)?.userOnly ? false : null,
    })),
    fixed: known.map(id => ({
      from: { source: "controlCenter", id: center.id, field: "fixedUserSettings", setting: id },
      value: center.fixedUserSettings?.includes(id) ? false : null,
    })),
  }
}

// アクションの許可: 表にあるか → AI が利用者だけのアクション・項目を頼んだか → 認可ステップ（ブックがあるとき）→
// ブックとアノテーションが対象ならそのブックのタイプ、そのほかが対象ならコントロールセンター（変えさせない項目 → アクションを使えるか）
function action(
  catalog: CoreCatalog,
  q: Extract<Query, { kind: "action" }>,
  controlCenter: string | null,
): Inspected<boolean> {
  const def: ActionDef | undefined = catalog.actions.get(q.action)
  const known: Step<boolean> = {
    from: { source: "catalog", table: "actions", id: q.action },
    value: def ? null : false,
  }
  if (!def) return decide([known])
  const userOnly: Step<boolean> = {
    from: { source: "action", id: def.id, field: "userOnly" },
    value: def.userOnly && isAI(q.actor) ? false : null,
  }
  const participation: Step<boolean> = {
    from: { source: "participation", id: def.id },
    value: !hasJoined(q.actor) && !joinsWithoutParticipation(def) && !isOnBook(def.target) ? false : null,
  }
  const { book, settings, where, record } = q
  const permitted = book
    ? permissionSteps(catalog, { kind: "book", action: def, book, actor: q.actor, ...(where ? { where } : {}) })
    : record && catalog.subjects.has(def.target)
      ? permissionSteps(catalog, {
          kind: "record",
          action: def,
          subject: def.target,
          def: catalog.subjects.get(def.target) as SubjectDef,
          record: record.record,
          refs: record.refs,
          actor: q.actor,
        })
      : []
  if (def.target === "book" || def.target === "annotations")
    return book
      ? decide([known, userOnly, ...permitted, ...placeSteps(catalog, def, book, where)])
      : decide([known, userOnly])
  const center = controlCenter === null ? undefined : catalog.controlCenters.get(controlCenter)
  if (!center)
    return decide([known, userOnly, participation, { from: { source: "controlCenter", id: null }, value: false }])
  const items = userSettingSteps(catalog, def.target === "settings" ? (settings ?? []) : [], q.actor, center)
  return decide([
    known,
    userOnly,
    participation,
    ...items.userOnly,
    ...permitted,
    ...items.fixed,
    ...centerSteps(def, center),
  ])
}

// 認可ステップを除いて決めた答え（タイプなどで使えるか。認可ステップが止めているかは見ない）
export const withoutPermissions = (answer: Inspected<boolean>): Inspected<boolean> =>
  decide(answer.steps.filter(s => s.from.source !== "permission"))

// 答えを止めたのが認可ステップなら、そのステップの id（使えるか、ほかのステップが止めたなら null）
export const deniedBy = (answer: Inspected<boolean>): string | null =>
  answer.value === false && answer.decidedBy?.source === "permission" ? answer.decidedBy.id : null

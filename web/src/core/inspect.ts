// 問い合わせ: ある値や許可が、どの決まりからどの順で決まったかを返す（デバッグと AI の問い合わせに使う）。
// 口はこの inspect 1 つで、問い合わせの種類（kind）ごとに調べ方を足す。
// ステップ（steps）は見る順に並べ、最初に値のあったステップで決まる（決まった後のステップも並べる）。ステップの出どころは文ではなくデータで返す

import { type Actor, hasJoined, isAI, USER } from "./actor"
import { findBinder, findPage, pagesOf } from "./book"
import type { ActionId, SubjectId } from "./catalog"
import { type CoreCatalog, pageType } from "./core-catalog"
import {
  type ActionContext,
  type ActionDef,
  ANY_PAGE_TYPE,
  attachedTo,
  BASE_TARGETS,
  isInBook,
  isOnPage,
  type Where,
} from "./def/action"
import type { ControlCenterDef } from "./def/control-center"
import type { PageTypeDef } from "./def/page-type"
import type { PageWhere, PermissionQuery, Referred } from "./def/permission"
import type { SubjectDef } from "./def/subject"
import { type Folder, foldersOverIn } from "./folders"
import { idsIn } from "./ids"
import type { KeyBinding } from "./keys"
import type { ItemPage } from "./placed"
import type { Book } from "./schema/book"

// ステップの出どころ
export type Source =
  | { source: "catalog"; table: "actions"; id: string } // 表にその定義があるか
  | { source: "pageType"; id: string; field: "actions.without" | "actions.add" } // ページのタイプが外す・足すアクション
  | { source: "action"; id: string; field: "attach"; pageType: string } // アクションの付く先が、そのタイプのページに当てはまるか
  | { source: "action"; id: string; field: "attach.books" | "attach.pages" } // アクションが、どのブック・どのページにも付くか（ページを名指さないとき）
  | { source: "action"; id: string; field: "run" } // 名指した所がブックに無い: ここでは止めず、行う側（run）が断る
  | { source: "action"; id: string; field: "userOnly" } // 利用者だけが行うアクションを、AI が頼んだ
  | { source: "participation"; id: string } // 参加が確定していない AI が、ブック・ページ・アノテーションのほかが対象のアクションを頼んだ
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
    // ブックの中でなく、ページそのもので問うときのページ（ブックの外のページか、書庫が対象のアクションが作るページ）。認可ステップには kind "page" で問い、
    // ページ・アノテーションが対象のアクションを使えるかは、そのページのタイプで決める
    page?: AskedPage
  }

// ページそのもので問うときの、ページと、認可ステップに見せるフォルダの列と、所（core/def/permission.ts の PagePermissionQuery）
export interface AskedPage {
  page: ItemPage
  folders: readonly Folder[]
  where?: PageWhere
}

export function inspect(
  catalog: CoreCatalog,
  query: Query,
  ctx?: Pick<ActionContext, "controlCenter">,
): Inspected<boolean> {
  return action(catalog, query, ctx?.controlCenter ?? null)
}

// アクション action を、開いているブック book の所 where で使えるかの問い。ブック・ページ・アノテーションが対象のアクションだけ book と where を渡す
// （ほかの対象は、コントロールセンターで決まる）
export function actionQuery(catalog: CoreCatalog, action: string, book: Book | undefined, where?: Where): Query {
  const onBook = book !== undefined && isInBook(catalog.actions.get(action)?.target)
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
// - 所がページのタイプを決める（ページ page・その中の物 ids・エントリ entries・作るページ creates）: そのタイプで決める（いくつものタイプにまたがるなら、どのタイプでも使えるときだけ）
// - 作るページのタイプがまだ分からない（ANY_PAGE_TYPE）: どれかのタイプで使えるか
// - アノテーションが対象で所が無い: ブックのどれかのページのタイプで使えるか（結び付く物のページごとの確かめは、行った後。core/annotation.ts）
// - ページが対象で、どのページも変える所（allPages）: ブックのどのページのタイプでも使えるか
// - ほか（ブック自身が対象・所がページを決めない）: タイプに依らない付く先（ブックが対象なら attach の books、ページが対象なら pages）だけで決める
function placeSteps(catalog: CoreCatalog, def: ActionDef, book: Book, where: Where | undefined): Step<boolean>[] {
  const at = typesAt(catalog, def, book, where)
  if (at === "missing") return [{ from: { source: "action", id: def.id, field: "run" }, value: true }]
  const onPage = def.target === "page"
  const field = onPage ? "attach.pages" : "attach.books"
  if (at === null)
    return [
      {
        from: { source: "action", id: def.id, field },
        value: (onPage ? def.attach?.pages : def.attach?.books) === true,
      },
    ]
  const [first, ...rest] = at.types.map(t => typeSteps(def, t))
  if (!first) return [{ from: { source: "action", id: def.id, field }, value: false }]
  if (at.need === "some") return [first, ...rest].find(steps => decide(steps).value === true) ?? first
  return [first, ...rest].find(steps => decide(steps).value !== true) ?? first
}

// 所 where が決めるページのタイプ（重ねずに）と、どのタイプでも使えることが要るか（every）、どれかで使えればよいか（some）。
// 所がページのタイプを決めなければ null（ブック自身）。名指したページ・物・エントリ・作るタイプが無ければ "missing"（タイプでは決められない。無い物は run が断る）
function typesAt(
  catalog: CoreCatalog,
  def: ActionDef,
  book: Book,
  where: Where | undefined,
): { types: PageTypeDef[]; need: "every" | "some" } | "missing" | null {
  // 許可スコープが "book" のアクションは、問う側が所を添えても、ページのタイプでは決めない（画面と perform で答えが割れないように）
  if (def.target === "book" && def.permissionScope === "book") return null
  const every = (ids: readonly (string | undefined)[]) =>
    (ids.length === 0 && def.target !== "annotations") || ids.includes(undefined)
      ? ("missing" as const)
      : { types: [...new Set(ids)].flatMap(t => (t ? [pageType(catalog, t)] : [])), need: "every" as const }
  if (where?.creates === ANY_PAGE_TYPE) return { types: [...catalog.pageTypes.values()], need: "some" }
  if (where?.creates !== undefined) return every([catalog.pageTypes.get(where.creates)?.id])
  if (where?.entries !== undefined)
    // 読めないページと、タイプが機能台帳に無いバインダは、タイプが分からないので使えない
    return every(
      where.entries
        .map(id => findPage(book, id)?.page.type ?? findBinder(book, id)?.pageType)
        .map(type => (type !== undefined && catalog.pageTypes.has(type) ? type : undefined)),
    )
  const pages = pagesOf(book)
  if (where?.page !== undefined) return every(pages.filter(p => p.id === where.page).map(p => p.type))
  if (where?.ids !== undefined)
    return every(
      pages
        .filter(({ id: _page, ...content }) => {
          const ids = new Set(idsIn(content))
          return where.ids?.some(id => ids.has(id))
        })
        .map(p => p.type),
    )
  // ページが対象で、どのページも変える所（allPages）なら、ブックのどのページのタイプでも使えるときだけ（ページが 1 枚も無ければ、使えない）。
  // アノテーションが対象で所が無ければ、ブックのどれかのページのタイプ
  const types = [...new Set(pages.map(p => p.type))].map(t => pageType(catalog, t))
  if (def.target === "page" && where?.allPages) return { types, need: "every" }
  return def.target === "annotations" ? { types, need: "some" } : null
}

// 答え answer を決めたのが、所のステップ（ページのタイプとアクションの付く先）か
export const decidedByPlace = (answer: Inspected<boolean>): boolean =>
  answer.decidedBy?.source === "pageType" ||
  (answer.decidedBy?.source === "action" && answer.decidedBy.field !== "userOnly")

// タイプ type でアクションを使えるか（typeSteps で決まる答え）
export const typeAllows = (def: ActionDef, type: PageTypeDef): boolean => decide(typeSteps(def, type)).value === true

// 認可ステップ: 表の並びで、止めるなら false（許すことはしないので、ほかは null）
function permissionSteps(catalog: CoreCatalog, q: PermissionQuery): Step<boolean>[] {
  return [...catalog.permissions.values()].map(p => ({
    from: { source: "permission", id: p.id },
    value: p.denies(q) ? false : null,
  }))
}

// 認可ステップへの行う前の問い: ページ・アノテーションが対象で、宛先のページが分かっていれば、そのページと、入れているフォルダの列で問う。
// ほかは、ブックで問う
function permissionQuery(def: ActionDef, book: Book, where: Where | undefined, actor: Actor): PermissionQuery {
  const page = isOnPage(def.target) && where?.page !== undefined ? findPage(book, where.page)?.page : undefined
  if (!page) return { kind: "folder", action: def, folder: book, actor, ...(where ? { where } : {}) }
  const ids = where?.ids
  return {
    kind: "page",
    action: def,
    page,
    folders: foldersOverIn(book, page.id),
    actor,
    ...(ids ? { where: { ids } } : {}),
  }
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
// ブック・ページ・アノテーションが対象なら所が名指すページのタイプ（名指さなければ、タイプに依らない付く先）、そのほかが対象ならコントロールセンター（変えさせない項目 → アクションを使えるか）
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
    value: !hasJoined(q.actor) && !joinsWithoutParticipation(def) && !isInBook(def.target) ? false : null,
  }
  const { book, settings, where, record, page } = q
  const permitted = book
    ? permissionSteps(catalog, permissionQuery(def, book, where, q.actor))
    : page
      ? permissionSteps(catalog, { kind: "page", action: def, ...page, actor: q.actor })
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
  if (isInBook(def.target))
    return book
      ? decide([known, userOnly, ...permitted, ...placeSteps(catalog, def, book, where)])
      : page && def.target !== "book"
        ? decide([known, userOnly, ...permitted, ...typeSteps(def, pageType(catalog, page.page.type))])
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

// 常駐（Go）の中で動くアクションの入口: ビルトインプラグインで機能台帳を組み、JSON で受けた世界（ブックと設定）にアクションを行い、変わったものを JSON で返す。
// 常駐は、これをまとめたファイル（internal/engine/engine.js。bun run build:engine）を埋め込み、goja で動かす。
// 追加プラグインは、常駐が変換した JS を同じ goja で動かして受け取り、matomezuUse でビルトインプラグインに足して組み直す。
// 追加プラグインが借りる実物（plugin-modules）は、読み込んだときに globalThis.__matomezuModules に置く（変換した JS はここから取り出す）
// 画面と同じ performIn を使うので、画面で先に行ったアクションを常駐で行い直すと同じ結果になる（振る id は ids で受ける）

import { z } from "zod"
import { actorOfWire, type WireActor } from "../core/actor"
import { isAIListed, listAIRecords, recordContext, UNLISTED_MODES } from "../core/ai-list"
import {
  type Annotations,
  annotationBriefs,
  annotationsForAi,
  checkAnnotations,
  restoreAnnotations,
  talkActions,
  unexpired,
} from "../core/annotation"
import { checkBooks, findPage, pageById, pagesOf, restoreBooks, unreadableOf, warnsOf } from "../core/book"
import { briefLine } from "../core/brief"
import { bulkActionOf, type LibraryRows, performBulk } from "../core/bulk"
import { PALETTE, PALETTE_MEANINGS } from "../core/color"
import type { CoreCatalog } from "../core/core-catalog"
import { type ActionOn, type AIEditTicketChange, type AIMessage, stopsOnEditLock } from "../core/def/action"
import { slideIsBackground } from "../core/def/page-type"
import type { SubjectDef } from "../core/def/subject"
import { binnedBetween, namingOf, systemFoldersInPlace } from "../core/entries"
import {
  bookIdOf,
  bookOf,
  createdOn,
  homeAndFoldersOf,
  libraryOf,
  NO_CHANGES,
  rawBooksOf,
  rowsHoldTree,
  rowsLibraryOf,
  withChanges,
  worldTablesOf,
} from "../core/folders"
import { detectLang, translate } from "../core/i18n/i18n"
import { changedIn } from "../core/ids"
import { splitId } from "../core/names"
import { endActions, joinActions } from "../core/participant"
import type { PerformedIn, World } from "../core/perform"
import { findShape, type ItemPage, pageItemsOf, walkShapes } from "../core/placed"
import { type Condition, type KeyValues, keyValuesOf } from "../core/record-keys"
import type { RecordSource } from "../core/record-source"
import {
  type Counters,
  checkRecords,
  REMOVED,
  type RecordChange,
  restoreCounters,
  restoreRecords,
} from "../core/records"
import { type Book, UNREADABLE_CODES } from "../core/schema/book"
import {
  aiSettings,
  disabledPluginsOf,
  isParticipantAlive,
  langOf,
  restoreSettings,
  settingSchema,
} from "../core/settings"
import { WARNINGS, type Warning, warning, warningText } from "../core/warnings"
import { MODULES, UI_NAMES } from "../plugin-modules"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../plugins"
import {
  aiPlacedOf,
  growKindOf,
  JOINED_MESSAGE,
  textColorRef,
  themesFor,
  VISITOR_JOINED_MESSAGE,
} from "../plugins/base"
import { type Assembled, assemble, type Plugin, warningsOf, withoutParts } from "../store/plugin"

;(globalThis as { __matomezuModules?: unknown }).__matomezuModules = MODULES

let assembled = assemble(BUILTIN, BUILTIN_CONTROL_CENTER)

// 追加プラグインを足して組み直す。新しい組で MCP 公開ツールの actions が返す物まで作り終えてから入れ替える（途中で投げれば、前の組のまま）。
// 返すのは JSON: warnings は warning の 1 行ずつ（常駐がログに書く）、ai は新しい組の MCP 公開ツールの actions が返す物
// settings（利用者の設定の JSON）を渡すと、利用者が有効にしていない追加プラグインは、名乗りと文言だけで組む（無効のプラグイン。disabledPluginsOf）。渡さなければ、全部有効で組む。
// 返す disabled は、無効で組んだプラグインの id
function use(added: readonly Plugin[], settings?: string): string {
  let used = added
  let disabled: string[] = []
  if (settings !== undefined) {
    const all = assemble([...BUILTIN, ...added], BUILTIN_CONTROL_CENTER)
    const off = disabledPluginsOf(
      all.catalog.core,
      restoreSettings(JSON.parse(settings)),
      added.map(p => p.id),
    )
    disabled = [...off]
    used = added.map(p => (off.has(p.id) ? withoutParts(p) : p))
  }
  const next = assemble([...BUILTIN, ...used], BUILTIN_CONTROL_CENTER)
  const ai = aiCatalog(next)
  assembled = next
  lastAdded = added
  return JSON.stringify({ warnings: warningsOf(next.catalog).map(warningText), ai, disabled })
}

// 今足している追加プラグイン（組み直すときの元）
let lastAdded: readonly Plugin[] = []

// 設定 settings で、無効になる追加プラグインの id（今足している物のうち）。設定が変わったあとに、組み直すかを決めるのに使う
;(globalThis as { matomezuDisabledPlugins?: (settings: string) => string }).matomezuDisabledPlugins = settings =>
  JSON.stringify([
    ...disabledPluginsOf(
      assembled.catalog.core,
      restoreSettings(JSON.parse(settings)),
      lastAdded.map(p => p.id),
    ),
  ])

// 受けるもの。pages と folders は対象のアクションが要るブックのページとフォルダ（置き場所から読んだまま。一覧のアクションなら全部、レコードが対象のアクションなら readsBooks が答えたブックの分。matomezuRecordNeeds の books）、
// ids は振る id のもと（画面で先に行ったときの値。尽きたら randomUUID）
// アクションバルクの中のアクション 1 つ
interface WireBulkAction {
  action: string
  args: unknown
  on?: ActionOn
  lang?: string // 画面で先に行ったときの言語。無ければ（AI が頼んだときなど）設定の言語の項目で決める
  ids?: string[]
  now?: string // 画面で先に行った時点。無ければ（AI が頼んだときなど）ホストが決めて渡す。それも無ければここで決める
  today?: string // now と同じ所が決めた日付（YYYY-MM-DD）。無ければ now の時点のここの暦の日付
}

interface Input {
  actions: readonly WireBulkAction[] // アクションバルク（順に行い、全部通るか全部断る。AI の頼みは 1 つ）
  pages?: unknown[]
  folders?: unknown[]
  settings: unknown
  annotations?: Readonly<Record<string, unknown>> // 要るブックのページのアノテーション（ページの id → 並び）
  counters?: unknown // 番号を振る種類の、区切りごとの次の番号（種類の id → 区切り → 次の番号。対象がその種類のアクションのとき）
  records?: unknown // 対象の定義が足した種類のレコード（種類の id → id → レコード。レコードが対象のアクションのとき、宛先と読むだけの種類）
  actor?: WireActor // 頼んだ者（無ければ利用者。AI は入っているワークルームの id を持つ）
  watched?: Readonly<Record<string, readonly string[]>> // 利用者が直している物（ページかブックの id → その中の物の id。編集ロック）
  watchedRecords?: Readonly<Record<string, readonly string[]>> // 利用者が直しているレコード（対象の種類の id → レコードの id。編集ロック）
}

// 返すもの。aiEditTickets はレコードが対象のアクションが返した AI 編集チケットの変え方の並び、pages と folders は変わった・足した・無くなったページとフォルダ（無くなった物は removed）、
// created はそのうち新しく足した物の id（常駐が、世界のどこにも無い id かを確かめる）、books は変わったブックの id（変わったページ・フォルダを持つブック。無くなったブックと、ゴミ箱に出入りしたブックも）、trashing は新しくゴミ箱に入るブックの id、annotations はアノテーションが変わったページの id → 新しい並び（空なら全部無くなった）、
// records は変わったレコードの並び（1 つのトランザクションで書く）、counters は進めた番号（種類の id → 区切り → 次の番号。進めた区切りだけ）。
// AI のアクションと lockedForUser のアクションが、受けた watched の物（ページの中の物・そのページのアノテーション・ページそのもの、ブックのバインダ・ブックそのもの）か watchedRecords のレコードを変えるか消すなら、何も変えずに being-edited で断る。
// 断ったら、detail に AI への説明（MCP 公開ツールが理由に添えて AI に返す）。認可ステップが止めたら（denied）、permission にそのステップの id
type Output =
  | {
      ok: true
      result: unknown
      pages: readonly RowChange[]
      folders: readonly RowChange[]
      created: readonly string[]
      books: readonly string[]
      library?: LibraryRows // 書庫の履歴に入るアクションが変えたページとフォルダごとの、前と後（無ければ none）
      trashing: readonly string[]
      settings?: unknown
      annotations?: Annotations
      records?: readonly RecordChange[] // 変わったレコード（消したなら record は removed）
      counters?: Counters
      notice?: string
      aiEditTickets?: readonly (AIEditTicketChange & { subject: string })[] // subject は、その変え方を返したアクションの対象の種類
      aiMessages?: readonly AIMessage[] // 送る AI 間メッセージ（常駐が、宛先に参加の確定した参加者がいるかを確かめ、書き込みと一緒に送る）
    }
  | {
      ok: false
      reason: string
      permission?: string
      kind?: string
      systemFolder?: string // 名前が重なる断り（title-taken）で、重なった相手がシステムフォルダのときの、その印
      detail?: string
      page?: string
      code?: string
      at?: number
    } // page と code は、読めないページの断り（unreadable）のとき。at は断られたアクションが何番目か

// 変わったページ・フォルダ 1 つ（row は新しい値。無くなったなら removed が true で、row は無い）
interface RowChange {
  id: string
  row?: unknown
  removed?: true
}
const rowChanges = (changed: Readonly<Record<string, unknown>>): RowChange[] =>
  Object.entries(changed).map(([id, row]) => (row === REMOVED ? { id, removed: true as const } : { id, row }))

declare const crypto: { randomUUID(): string }

// 理由ごとの AI への説明
const AI_REFUSALS: Record<Exclude<PerformedIn, { ok: true }>["reason"], string> = {
  unknown: "there is no action with that id (see actions)",
  "bad-args": "the args do not match the action's args (see actions)",
  "not-allowed":
    "the page's type (or, for an action on the whole book, the action itself; or, for the library, the settings and the records, the control center) does not allow it",
  refused: "the action's rules refuse it (for example the page or item does not exist); read_page to check",
  denied: "a permission step stopped it",
  "no-book": "there is no book with that id (see list_books)",
  "no-page": "there is no page with that id (on.page is the id of a page; read_book lists a book's pages)",
  "no-record": "there is no record with that id (on.record is the id of a record of the action's subject)",
  unreadable: "that page cannot be read now (code is the reason); nothing can be done to it",
}

// 断りに、AI への説明を添える
function refusal(catalog: CoreCatalog, done: Exclude<PerformedIn, { ok: true }>): Extract<Output, { ok: false }> {
  if ("permission" in done)
    return {
      ...done,
      detail: `by ${done.permission}: ${catalog.permissions.get(done.permission)?.aiDescription ?? AI_REFUSALS.denied}`,
    }
  if ("because" in done && done.because === "not-joined")
    return {
      ok: false,
      reason: done.reason,
      detail:
        "not-joined: you have not joined matomezu yet (not accepted by the user, or not told by the hook): until then you can only read, and every action is refused; ask the user in the chat",
    }
  if ("because" in done && done.because === "visitor")
    return {
      ok: false,
      reason: done.reason,
      detail: "visitor: you joined matomezu as a visitor, and a visitor only reads; every action is refused",
    }
  if ("setting" in done && done.setting !== undefined) {
    const detail =
      done.because === "user-only"
        ? `the setting ${done.setting} is changed only by the user; ask the user in the chat`
        : `the control center keeps the setting ${done.setting} fixed`
    return { ok: false, reason: done.reason, detail }
  }
  // 断りの種類（run が添えた名前か、土台の種類）は、そのまま添える
  const kind = "kind" in done && done.kind !== undefined ? { kind: done.kind } : {}
  // 名前が重なった相手のシステムフォルダの印も、そのまま添える
  const mark = "systemFolder" in done && done.systemFolder !== undefined ? { systemFolder: done.systemFolder } : {}
  if ("detail" in done && done.detail !== undefined)
    return { ok: false, reason: done.reason, ...kind, ...mark, detail: done.detail }
  // 読めないページの断りは、そのページの id と理由の番号を添える（常駐は AI に番号だけを返す）
  if (done.reason === "unreadable")
    return { ok: false, reason: done.reason, page: done.page, code: done.code, detail: AI_REFUSALS.unreadable }
  return { ok: false, reason: done.reason, ...kind, detail: AI_REFUSALS[done.reason] }
}

// ホストが置いた、レコードを引く口（常駐が行う間だけ答える。無ければ、受けたレコードだけで行う）: 1 件（無ければ空の文字）と、種類の全部（id → レコードの JSON）
// 探す口は、条件 where（JSON）に合うかもしれないレコードを id → { record, keys } で答える（keysOnly なら record は無い。keys は置き場所が持っている索引キーの値）
const hostRecords = globalThis as {
  matomezuHostRecord?: (subject: string, id: string) => string
  matomezuHostFind?: (subject: string, where: string, keysOnly: boolean) => string
}

type HostFound = Readonly<Record<string, { record?: unknown; keys?: KeyValues }>>

// レコードの読み口: 受けたレコード given（宛先と、種類の並びで読む種類）に無い物は、ホストから引く
function hostSource(given: Readonly<Record<string, Readonly<Record<string, unknown>>>>): RecordSource | null {
  const { matomezuHostRecord: one, matomezuHostFind: find } = hostRecords
  if (!one || !find) return null
  const found = (subject: string, where: readonly Condition[], keysOnly: boolean): HostFound =>
    (parseOr(find(subject, JSON.stringify(where), keysOnly)) ?? {}) as HostFound
  return {
    byId: (subject, id) => given[subject]?.[id] ?? parseOr(one(subject, id)),
    candidates: (subject, where) => ({
      ...Object.fromEntries(Object.entries(found(subject, where, false)).map(([id, row]) => [id, row.record])),
      ...given[subject],
    }),
    keys: (subject, where) =>
      Object.fromEntries(Object.entries(found(subject, where, true)).map(([id, row]) => [id, row.keys ?? {}])),
  }
}

function perform(input: Input): Output {
  const { controlCenter } = assembled
  const catalog = assembled.catalog.core
  const settings = restoreSettings(input.settings)
  const langFor = (l: string | undefined) =>
    l ? detectLang([l], [...catalog.languages.keys()]) : langOf(catalog, settings, "en")
  const raw = rawBooksOf(input.pages ?? [], input.folders ?? [])
  const books = Object.fromEntries(restoreBooks(catalog, raw).map(b => [b.id, b]))
  const annotations = Object.fromEntries(
    Object.entries(input.annotations ?? {}).map(([page, list]) => [page, restoreAnnotations(list)]),
  )
  const records = restoreRecords(input.records)
  const counters = restoreCounters(input.counters)
  const actor = actorOfWire(input.actor)
  const source = hostSource(records)
  const tables = worldTablesOf(Object.values(books), homeAndFoldersOf(input.folders ?? []))
  const world = { ...tables, settings, annotations, records, counters, ...(source ? { source } : {}) }
  // 時点が渡されなかったアクションの時点（その日付も、bulkActionOf がこの同じ時点から決める）
  const at = new Date().toISOString()
  const steps = input.actions.map(a => bulkActionOf(a, () => crypto.randomUUID(), at, langFor(a.lang)))
  // AI のアクションと、利用者でも編集ロックで断るアクションは、利用者が直している物を変えも消しもしない（あとでやり直す）。バルクの中のアクションごとに見る。
  // レコードが対象のアクションは、変えるレコードのどれかを直しているなら、同じように断る（作るレコードは新しい id なので、直してはいない）
  const done = performBulk(
    world,
    steps,
    { catalog, controlCenter, lang: langFor(input.actions[0]?.lang), actor },
    (i, before, after, one) => {
      if (!stopsOnEditLock(catalog.actions.get(input.actions[i]?.action ?? ""), actor)) return undefined
      const editedRecord = (one.records ?? []).some(c => (input.watchedRecords?.[c.subject] ?? []).includes(c.id))
      return editedRecord || touchedIn(before, after, one.annotations, input.watched).length > 0
        ? { ok: false as const, reason: "being-edited" as const }
        : undefined
    },
  )
  if (!done.ok)
    return {
      ...(done.reason === "being-edited" ? { ok: false, reason: done.reason } : refusal(catalog, done)),
      at: done.at,
    }
  // 変わったブック（組み直した値）と、無くなったブック
  const after = done.changes ? withChanges(tables, done.changes) : tables
  const next = done.changes ? libraryOf(after) : books
  const changed = Object.values(next).filter(b => books[b.id] !== b)
  const removed = Object.keys(books).filter(id => !(id in next))
  // ゴミ箱に入ったブックと、ゴミ箱から出たブック（ブックを中に持つフォルダごと出入りしたときの、中のブックも。ブックの値は変わらない）
  // フォルダの行が変わらなければ、置き場所は変わらない
  const moved = Object.keys(done.changes?.folders ?? {}).length > 0
  const binned = moved ? binnedBetween(tables, after) : { trashed: [], restored: [] }
  const trashing = binned.trashed.filter(id => id in next)
  const restoring = binned.restored.filter(id => id in next)
  const notice = shiftNotice(books, changed)
  const changes = done.changes ?? NO_CHANGES
  return {
    ok: true,
    result: done.results.at(-1),
    pages: rowChanges(changes.pages),
    folders: rowChanges(changes.folders),
    created: createdOn(tables, changes),
    books: [...new Set([...changed.map(b => b.id), ...removed, ...trashing, ...restoring])],
    trashing,
    ...(done.library ? { library: done.library } : {}),
    ...(done.settings ? { settings: done.settings } : {}),
    ...(done.annotations ? { annotations: done.annotations } : {}),
    ...(done.records ? { records: done.records.map(c => withKeys(catalog, c)) } : {}),
    ...(done.counters ? { counters: done.counters } : {}),
    ...(notice ? { notice } : {}),
    ...(done.aiEditTickets
      ? { aiEditTickets: done.aiEditTickets.map(t => ({ ...t.change, subject: t.subject })) }
      : {}),
    ...(done.aiMessages ? { aiMessages: done.aiMessages } : {}),
  }
}

// アクション 1 つが、利用者が直している物 watched（ブックの中の物・ページの中の物とそのページのアノテーション）を変えたか消した所（before と after はそのアクションの前と後の世界、changedAnnotations はそのアクションが変えたアノテーション）
function touchedIn(
  before: World,
  after: World,
  changedAnnotations: Annotations | undefined,
  watched: Input["watched"],
): readonly unknown[] {
  if (!watched || Object.keys(watched).length === 0) return []
  return Object.entries(watched).flatMap(([id, list]) => {
    // ブックの中の物（バインダ・ブックそのもの）
    const was = bookOf(before, id)
    if (was) return changedIn(was, bookOf(after, id), list)
    // ページの中の物と、そのページのアノテーション（そのページを持っているブックだけを組む）
    const holder = bookIdOf(before.folders, id)
    const held = holder ? bookOf(before, holder) : undefined
    const at = held ? pageById({ [held.id]: held }, id) : undefined
    if (!at) return []
    const annotationsNow =
      changedAnnotations && id in changedAnnotations ? changedAnnotations[id] : before.annotations[id]
    const book = bookOf(after, at.book.id)
    return changedIn(
      { page: at.page, annotations: before.annotations[id] },
      { page: book && findPage(book, id)?.page, annotations: annotationsNow },
      list,
    )
  })
}

// 中身をずらした可変ページ（ページの shift が変わった）があれば、AI への知らせ（位置が変わったので読み直す）
function shiftNotice(before: Readonly<Record<string, Book>>, changed: readonly Book[]): string | null {
  const shiftOf = (b: Book | undefined, page: string) =>
    (b ? findPage(b, page)?.page.shift : undefined) ?? { x: 0, y: 0 }
  const moved = changed.flatMap(b =>
    pagesOf(b).flatMap(p => {
      const was = shiftOf(before[b.id], p.id)
      const now = shiftOf(b, p.id)
      const dx = now.x - was.x
      const dy = now.y - was.y
      return dx || dy ? [`page ${p.id} of book ${b.id} by ${dx} paper(s) right and ${dy} down`] : []
    }),
  )
  return moved.length
    ? `The contents of a variable page were shifted by whole papers, so every position there changed (${moved.join("; ")}); read_page before using positions.`
    : null
}

// MCP 公開ツールの actions の元になる物: 表ごとの全文（アクション・アイテム・設定などの args・props の JSON Schema まで）に、目次 index を添える。
// 全文は、機能台帳から AI に見せる物（利用者だけのアクションと、利用者だけが変える設定の項目は除く）を書き出したもの。名前は英語。
// 目次は、AI が最初に受け取る物: 大きい表（アクション・アイテム・設定）は id と題名だけにし、全文は id を渡して取る。小さい表は全文のまま入れる
function aiCatalog(of: Assembled = assembled) {
  const tables = aiTables(of)
  const { actions, items, settings, subjects, ...whole } = tables
  return {
    ...tables,
    index: {
      actions: actions.map(a => ({ id: a.id, target: a.target, title: a.title })),
      items: items.map(i => ({ id: i.id, kind: i.kind, title: i.title })),
      settings: settings.map(s => ({ id: s.id, title: s.title })),
      subjects: subjects.map(s => ({ id: s.id, title: s.title })),
      ...whole,
    },
  }
}

function aiTables(of: Assembled) {
  const catalog = of.catalog.core
  const en = (key: string) => translate(catalog.messages, "en", key as never)
  return {
    actions: [...catalog.actions.values()]
      .filter(a => !a.userOnly)
      .map(a => ({
        id: a.id,
        target: a.target,
        title: en(a.title),
        description: a.aiDescription,
        args: z.toJSONSchema(a.describeArgs?.(catalog) ?? a.args, { io: "input", unrepresentable: "any" }),
      })),
    pageTypes: [...catalog.pageTypes.values()].map(t => ({
      id: t.id,
      title: en(t.title),
      grouping: t.grouping, // binder のタイプのページは、そのタイプのバインダの中にだけ置ける
      grows: growKindOf(t.grow), // 可変ページの決め方（base の growKindOf）
      items: t.items.allowed, // ページに置けるアイテム
      // ページの slide（形だけの並び）に置けるアイテムと、その並びがページの背景か本体か（無ければ null）。read_page には、背景は有無と文字だけが見える（page.background.texts）
      slide: t.slide ? { items: t.slide.allowed, role: slideIsBackground(t) ? "background" : "body" } : null,
      themes: themesFor(catalog, t.id).map(th => th.id), // そのタイプのページと中の形に当てられるテーマ（テーマタイプの重なりは、ここで計算して出す）
    })),
    items: [...catalog.items.values()].map(i => ({
      id: i.id,
      kind: i.kind, // shape は置く形、connector は 2 つの形をつなぐもの
      title: en(i.title),
      size: i.kind === "shape" ? i.size : null,
      props: z.toJSONSchema(i.props, { io: "input", unrepresentable: "any" }),
    })),
    // 利用者の設定の項目（settings-set で変え、read_settings で読む）
    settings: [...catalog.userSettings.values()]
      .filter(d => !d.userOnly)
      .map(d => ({
        id: d.id,
        title: en(d.title),
        schema: z.toJSONSchema(settingSchema(catalog, d, "user"), { io: "input", unrepresentable: "any" }),
      })),
    // アノテーションの種類（read_book・read_page の annotations と view の awaiting の annotation は、この id）
    annotations: [...catalog.annotations.values()].map(a => ({
      id: a.id,
      title: en(a.title),
      description: a.aiDescription,
      props: z.toJSONSchema(a.props, { io: "input", unrepresentable: "any" }),
    })),
    // 対象の定義（レコードの種類。アクションの target はこの id のとき、perform の on は { record: レコードの id }（作るときは on を書かない））
    subjects: [...catalog.subjects.values()]
      .filter(s => s.aiBrief !== undefined)
      .map(s => ({
        id: s.id,
        title: en(s.title),
        description: s.aiDescription,
        record: z.toJSONSchema(s.record, { io: "input", unrepresentable: "any" }),
        // 一覧の既定の目次に載せない物（read_records の unlisted で include か only を付けると取れる）
        ...(s.aiListed ? { unlisted: s.aiListed.unlisted } : {}),
        // 索引キー（read_records の where に書ける名前と型。一覧の既定の並びを持つ種類だけが、索引キーで探す）
        ...(s.aiList && s.keys
          ? { keys: Object.fromEntries(Object.entries(s.keys).map(([name, key]) => [name, key.type])) }
          : {}),
      })),
    // 郵便の種類（read_records の郵便の mail は、この id）
    mails: [...catalog.mails.values()].map(m => ({
      id: m.id,
      title: en(m.title),
      description: m.aiDescription,
      props: z.toJSONSchema(m.props, { io: "input", unrepresentable: "any" }),
    })),
    themes: [...catalog.themes.values()].map(th => ({ id: th.id, title: en(th.title) })),
    // 言語パック（言語の項目の値は、この id）とスキン
    languages: [...catalog.languagePacks.values()].map(p => ({ id: p.id, lang: p.lang, name: p.name })),
    skins: [...catalog.skins.keys()],
    colors: PALETTE.map(id => ({ id, meaning: PALETTE_MEANINGS[id] })),
    // 本文の装飾の文字の色（name は本文に書く名前: {name:文字}）
    textColors: [...catalog.textColors.values()].map(c => ({
      id: c.id,
      name: textColorRef(c.id),
      meaning: c.aiDescription,
    })),
  }
}

;(globalThis as { matomezuModuleNames?: () => string }).matomezuModuleNames = () =>
  JSON.stringify({ engine: Object.keys(MODULES), ui: UI_NAMES })

;(globalThis as { matomezuUse?: (added: readonly Plugin[], settings?: string) => string }).matomezuUse = use

;(globalThis as { matomezuAiCatalog?: () => string }).matomezuAiCatalog = () => JSON.stringify(aiCatalog())

// AI が読む設定（MCP 公開ツールの read_settings）: 残した設定から、利用者だけが変える項目と機能台帳に無い項目を除き、値が無いか形に合わない項目は既定にする
;(globalThis as { matomezuReadSettings?: (settings: string) => string }).matomezuReadSettings = settings =>
  JSON.stringify(aiSettings(assembled.catalog.core, restoreSettings(JSON.parse(settings))))

// 残したブックを今の機能台帳で確かめ、warning のあるブック（ブックごと読めない W005・W006、読めないページがある W027〜W029、一部に無い物がある W007）の
// id・番号・warning の 1 行と、ブックごと読めないか（unreadable）を返す（常駐が一覧に持つ）。読めないページの warning は、ページ 1 枚ごとに、
// そのページの id（page）を添えて返す（1 行は、同じブックの同じ理由のページで同じ）
;(globalThis as { matomezuCheckBooks?: (books: string) => string }).matomezuCheckBooks = books => {
  const read = checkBooks(assembled.catalog.core, JSON.parse(books) as unknown[])
  const line = (n: Warning, unreadable: boolean) => ({
    book: n.params.book ?? "",
    code: n.code,
    warning: warningText(n),
    unreadable,
  })
  const ofPages = (n: Warning): boolean => (UNREADABLE_CODES as readonly string[]).includes(n.code)
  // 読めないページ 1 枚ごとに、そのページの理由の warning
  const pages = read.books.flatMap(book =>
    unreadableOf(book).flatMap(u => {
      const found = read.partial.find(n => warnsOf(n, book.id, u))
      return found ? [{ ...line(found, false), page: u.id }] : []
    }),
  )
  return JSON.stringify([
    ...read.warnings.map(n => line(n, true)),
    ...read.partial.filter(n => !ofPages(n)).map(n => line(n, false)),
    ...pages,
  ])
}

// 残したフォルダの行の全部（書庫ホーム・フォルダ・ブック・バインダ）とページの行の id の全部が木の決まりを守るかを確かめ、破れていれば warning（W030）の 1 行を、守っていれば空の文字列を返す
// （常駐が一覧に持つ。データには手を付けない）
;(globalThis as { matomezuCheckLibrary?: (folders: string, pages: string) => string }).matomezuCheckLibrary = (
  folders,
  pages,
) =>
  rowsHoldTree(JSON.parse(folders) as unknown[], JSON.parse(pages) as string[])
    ? ""
    : warningText(warning("W030", "", {}))

// 書庫のシステムフォルダが今の機能台帳に合っているか（core/entries.ts の systemFoldersInPlace。名前は利用者の設定 settings の言語で引く）。
// 常駐が、データを書いたあとに、機能台帳に合わせてデータを足すアクションを行うかを決める。受けるのは、書庫ホーム・ゴミ箱・フォルダの行の全部と、
// 書庫ホームの直下のブック・バインダの行の folders、書庫ホームの直下のページの行 pages（id → 行）
;(
  globalThis as { matomezuSystemFoldersInPlace?: (folders: string, pages: string, settings: string) => boolean }
).matomezuSystemFoldersInPlace = (folders, pages, settings) => {
  const catalog = assembled.catalog.core
  const library = rowsLibraryOf(JSON.parse(folders) as unknown[], JSON.parse(pages) as Record<string, unknown>)
  return systemFoldersInPlace(library, namingOf(catalog, restoreSettings(JSON.parse(settings))))
}

// 残したアノテーションを今の機能台帳で確かめ、効かないもの（種類が無い W018・形が合わない W019）の warning の 1 行ずつを返す（常駐がログに書く）。
// 受けるのは、ブックと、そのページごとのアノテーション（ページの id → 並び）の組。読めないブックのアノテーションは確かめない
;(globalThis as { matomezuCheckAnnotations?: (pairs: string) => string }).matomezuCheckAnnotations = pairs => {
  const catalog = assembled.catalog.core
  const lines = (JSON.parse(pairs) as AnnotatedBook[]).flatMap(p => {
    const [book] = restoreBooks(catalog, [p.book])
    return book
      ? pagesOf(book).flatMap(page =>
          checkAnnotations(catalog, book, page, restoreAnnotations(p.annotations[page.id])).map(warningText),
        )
      : []
  })
  return JSON.stringify(lines)
}

// ブックと、そのページごとのアノテーション（ページの id → 並び）の組（常駐が渡す）
interface AnnotatedBook {
  book: unknown
  annotations: Readonly<Record<string, unknown>>
}
// 常駐が初めて起動したときに 1 度だけ行うアクション（ActionDef の runsOnceAtStart）の id の並び
;(globalThis as { matomezuRunOnceActions?: () => string }).matomezuRunOnceActions = () =>
  JSON.stringify([...assembled.catalog.core.actions.values()].filter(a => a.runsOnceAtStart).map(a => a.id))

// 機能台帳に合わせてデータを足すアクション（ActionDef の runAndKeepsWithCatalog。常駐が、起動したときと機能台帳が変わったときと、データを書いて書庫のシステムフォルダが機能台帳に合わなくなったときに行う）の id の並び
;(globalThis as { matomezuCatalogActions?: () => string }).matomezuCatalogActions = () =>
  JSON.stringify([...assembled.catalog.core.actions.values()].filter(a => a.runAndKeepsWithCatalog).map(a => a.id))

// システムフォルダの定義の id → AI に見せる名前（英語の文言）。read_folder でシステムフォルダの名前に使う
;(globalThis as { matomezuSystemFolderTitles?: () => string }).matomezuSystemFolderTitles = () => {
  const { messages, systemFolders } = assembled.catalog.core
  return JSON.stringify(
    Object.fromEntries([...systemFolders.values()].map(d => [d.id, translate(messages, "en", d.title)])),
  )
}

// AI に見せる種類 kind のレコードの一覧（read_records）の、種類の全部を読む道: where（項目 → 値）に合う物を、載せる物と載せない物（aiListed）に分け、unlisted（hide・include・only）の物の id と 1 行（aiBrief）を、
// 並びの鍵（aiOrder。無ければ id）の順に返す（core/ai-list.ts）。hide のときは、載せなかった数も返す。指す先のレコードは、ホストの読み口から引く。AI に見せない種類・無い種類は null
;(
  globalThis as {
    matomezuAiRecords?: (kind: string, records: string, where: string, unlisted: string) => string
  }
).matomezuAiRecords = (kind, records, where, unlisted) => {
  const def = assembled.catalog.core.subjects.get(kind)
  if (def === undefined || def.aiBrief === undefined) return "null"
  const source = hostSource({})
  const mode = UNLISTED_MODES.find(m => m === unlisted) ?? "hide"
  return JSON.stringify(
    listAIRecords(
      assembled.catalog.core,
      def,
      JSON.parse(records) as unknown[],
      JSON.parse(where) as Record<string, string>,
      mode,
      (subject, id) => source?.byId(subject, id),
    ),
  )
}

// 種類 subject のレコード records（JSON。id → レコード）のうち、一覧の既定の目次に載せない物の id の並び（core/ai-list.ts の isAIListed）。横断検索が、横断検索の当たりを分けるのに引く。指す先は、ホストの読み口から引く
;(globalThis as { matomezuUnlistedOf?: (subject: string, records: string) => string }).matomezuUnlistedOf = (
  subject,
  records,
) => {
  const def = assembled.catalog.core.subjects.get(subject)
  const source = hostSource({})
  const out: string[] = []
  if (def) {
    for (const [id, record] of Object.entries(parseOr(records) as Record<string, unknown>)) {
      const parsed = def.record.safeParse(record)
      try {
        if (parsed.success && !isAIListed(assembled.catalog.core, def, parsed.data, (s, i) => source?.byId(s, i)))
          out.push(id)
      } catch {}
    }
  }
  return JSON.stringify(out)
}

// 変えたレコード 1 件に、索引キーの値を添える（置き場所が中身とは別に置く。消したレコードと、索引キーの無い種類には添えない）
function withKeys(
  catalog: CoreCatalog,
  change: RecordChange,
): RecordChange & { keys?: KeyValues; search?: { title: string; body: string } } {
  const def = catalog.subjects.get(change.subject)
  if (def === undefined || change.record === REMOVED) return change
  const search = def.searchTexts ? searchTextOf(def, change.record) : undefined
  return {
    ...change,
    ...(def.keys ? { keys: keyValuesOf(def, change.record) } : {}),
    ...(search ? { search } : {}),
  }
}

// レコード 1 件の、横断検索に使う文字（形に合わない・関数が投げたレコードは undefined）
function searchTextOf(def: SubjectDef, record: unknown): { title: string; body: string } | undefined {
  const parsed = def.record.safeParse(record)
  if (!parsed.success || def.searchTexts === undefined) return undefined
  try {
    const { title, body } = def.searchTexts(parsed.data as never)
    return { title: title ?? "", body: body ?? "" }
  } catch {
    return undefined
  }
}
// 今の機能台帳の、レコードの種類と索引キーの宣言（常駐が置き場所に伝える。索引キーは宣言の順）
;(globalThis as { matomezuKinds?: () => string }).matomezuKinds = () =>
  JSON.stringify(
    [...assembled.catalog.core.subjects.values()].map(s => ({
      subject: s.id,
      keys: Object.entries(s.keys ?? {}).map(([name, key]) => ({ name, type: key.type })),
      // AI に見せる種類か（aiBrief を書いた種類）と、その一覧の既定の並びと件数（aiList。索引キーで探す種類だけ）
      search: s.searchTexts !== undefined,
      ai: s.aiBrief !== undefined,
      ...(s.aiBrief !== undefined && s.aiList && s.keys?.[s.aiList.order.key] ? { aiList: s.aiList } : {}),
      // 目次に載せない物がある種類の、載せない物の説明（aiListed。read_records の unlisted を受ける種類）
      ...(s.aiBrief !== undefined && s.aiListed ? { aiUnlisted: s.aiListed.unlisted } : {}),
    })),
  )

// AI に見せる種類 kind のレコードの並び records（JSON。常駐が索引キーで探して並べた、その件数だけ）の、一覧の行: id・種類が添えるフィールド（aiRow）・題（brief）。
// 並びは受けた順のまま。形に合わないレコードは id だけの行にする（数と続きが食い違わないように）
;(globalThis as { matomezuAiRows?: (kind: string, records: string) => string }).matomezuAiRows = (kind, records) => {
  const catalog = assembled.catalog.core
  const source = hostSource({})
  const def = catalog.subjects.get(kind)
  const brief = def?.aiBrief
  if (def === undefined || brief === undefined) return "null"
  return JSON.stringify(
    (JSON.parse(records) as unknown[]).map(r => {
      const parsed = def.record.safeParse(r)
      if (!parsed.success) return { id: String((r as { id?: unknown } | null)?.id ?? "") }
      const { id } = parsed.data as { id: string }
      const line = briefLine(
        brief(
          parsed.data,
          recordContext(catalog, def, parsed.data, (s, i) => source?.byId(s, i)),
        ),
        120,
      )
      return { id, ...(def.aiRow?.(parsed.data) ?? {}), ...(line === "" ? {} : { brief: line }) }
    }),
  )
}

// 種類 subject のレコード records（JSON。id → レコード）の、索引キーの値（id → 名前 → 値）。常駐が、宣言が変わったあとに置き場所へ入れ直すのに引く
;(globalThis as { matomezuKeysOf?: (subject: string, records: string) => string }).matomezuKeysOf = (
  subject,
  records,
) => {
  const def = assembled.catalog.core.subjects.get(subject)
  const table = restoreRecords({ [subject]: parseOr(records) })[subject] ?? {}
  return JSON.stringify(
    Object.fromEntries(Object.entries(table).map(([id, record]) => [id, def ? keyValuesOf(def, record) : {}])),
  )
}

// 種類 subject のレコード records（JSON。id → レコード）の、横断検索に使う文字（id → 題と本文）。常駐が、探す文字を入れ直すのに引く（形に合わないレコードは含めない）
;(globalThis as { matomezuSearchTextsOf?: (subject: string, records: string) => string }).matomezuSearchTextsOf = (
  subject,
  records,
) => {
  const def = assembled.catalog.core.subjects.get(subject)
  const out: Record<string, { title: string; body: string }> = {}
  if (def?.searchTexts) {
    for (const [id, record] of Object.entries(parseOr(records) as Record<string, unknown>)) {
      const text = searchTextOf(def, record)
      if (text) out[id] = text
    }
  }
  return JSON.stringify(out)
}

// 種類 subject のレコード records（JSON。id → レコード）の、親（refers の先頭 1 件。id → {subject, id}）。refers を書かない種類・指す先の無いレコード・形に合わないレコードは含めない
;(globalThis as { matomezuParentsOf?: (subject: string, records: string) => string }).matomezuParentsOf = (
  subject,
  records,
) => {
  const def = assembled.catalog.core.subjects.get(subject)
  const out: Record<string, { subject: string; id: string }> = {}
  if (def?.refers) {
    for (const [id, record] of Object.entries(parseOr(records) as Record<string, unknown>)) {
      const parsed = def.record.safeParse(record)
      if (!parsed.success) continue
      try {
        const first = def.refers(parsed.data as never)[0]
        if (first) out[id] = { subject: first.subject, id: first.id }
      } catch {}
    }
  }
  return JSON.stringify(out)
}

// 常駐と core が種類で引く役（参加者・ワークルーム・郵便）ごとの、対象の定義の id（役を名乗る定義が無ければ入れない）
;(globalThis as { matomezuSubjectRoles?: () => string }).matomezuSubjectRoles = () =>
  JSON.stringify(
    Object.fromEntries([...assembled.catalog.core.subjects.values()].flatMap(s => (s.role ? [[s.role, s.id]] : []))),
  )

// 残したレコードを今の機能台帳で確かめ、効かないレコード（種類が無い W024・形が合わない W025。形のほかの確かめを書いた種類はその warning。郵便なら、郵便の種類が無い W022・形が合わない W023）の warning の 1 行ずつを返す（常駐がログに書く）
;(globalThis as { matomezuCheckRecords?: (records: string) => string }).matomezuCheckRecords = records =>
  JSON.stringify(checkRecords(assembled.catalog.core, restoreRecords(JSON.parse(records))).map(warningText))

// ブックとそのページごとのアノテーションの組ごとに、AI に見せる並び（annotationsForAi。付いているページと、AI の応えを待っているか。ブックのページの順）を返す。
// 読めないブックのアノテーションは、待たないものとして返す
;(globalThis as { matomezuAiAnnotations?: (pairs: string) => string }).matomezuAiAnnotations = pairs => {
  const catalog = assembled.catalog.core
  const out = (JSON.parse(pairs) as AnnotatedBook[]).map(p => {
    const [book] = restoreBooks(catalog, [p.book])
    return book
      ? pagesOf(book).flatMap(page => annotationsForAi(catalog, page, restoreAnnotations(p.annotations[page.id])))
      : Object.entries(p.annotations).flatMap(([page, list]) =>
          restoreAnnotations(list).map(a => ({ ...a, page, awaits: false })),
        )
  })
  return JSON.stringify(out)
}

// ブックとそのページごとのアノテーションの組ごとに、待っている物を AI に知らせる 1 行（annotationBriefs。ページの id → アノテーションの id → 1 行）を返す。読めないブックは空
;(globalThis as { matomezuAiBriefs?: (pairs: string) => string }).matomezuAiBriefs = pairs => {
  const catalog = assembled.catalog.core
  const out = (JSON.parse(pairs) as AnnotatedBook[]).map(p => {
    const [book] = restoreBooks(catalog, [p.book])
    return Object.fromEntries(
      (book ? pagesOf(book) : []).map(page => [
        page.id,
        annotationBriefs(catalog, page, restoreAnnotations(p.annotations[page.id])),
      ]),
    )
  })
  return JSON.stringify(out)
}

// ブックのページごとの、形の描いた位置と大きさ（base の aiPlacedOf。AI の read_page に添える）。読めないブックか、プレゼンテーションが答えなければ null
;(globalThis as { matomezuAiPlaced?: (book: string) => string }).matomezuAiPlaced = book => {
  const catalog = assembled.catalog.core
  const [read] = restoreBooks(catalog, [JSON.parse(book)])
  return JSON.stringify(read ? aiPlacedOf(catalog, read) : null)
}

// AI に見せるページ（read_page の page）: 背景を持つタイプのページの slide（背景の形）は、図形の情報（位置・大きさ・形の種類など）を見せず、
// 背景があることと、背景の形が持つ名前（形の定義の labelOf。文字枠なら書いた文字。重ねの順）だけを background に入れる。背景を持たないタイプと、背景の無いページはそのまま返す
;(globalThis as { matomezuAiPage?: (book: string, page: string) => string }).matomezuAiPage = (book, page) => {
  const catalog = assembled.catalog.core
  const [read] = restoreBooks(catalog, [JSON.parse(book)])
  const body = JSON.parse(page) as { type?: string; slide?: { id: string; item: string }[] }
  const type = typeof body.type === "string" ? catalog.pageTypes.get(body.type) : undefined
  if (!read || !type || !Array.isArray(body.slide) || body.slide.length === 0 || !slideIsBackground(type)) return page
  const { slide, ...rest } = body
  const texts = slide.flatMap(s => {
    const def = catalog.items.get(s.item)
    const text = def?.kind === "shape" ? def.labelOf?.(s as never, s.id) : undefined
    return text ? [text] : []
  })
  return JSON.stringify({ ...rest, background: { texts } })
}

// ページ page（JSON）の中の、どの深さの形も、つなぐものも、id で探した物と、その物と子の形の id の全部（AI の read_page の item）。無ければ null
;(globalThis as { matomezuAiItem?: (page: string, id: string) => string }).matomezuAiItem = (page, id) => {
  const body = JSON.parse(page) as ItemPage
  const shape = findShape(body, id)?.shape
  const item = shape ?? pageItemsOf(body).find(i => i.id === id)
  if (!item) return JSON.stringify(null)
  const ids = shape ? walkShapes({ ...body, items: [shape] }).map(s => s.shape.id) : [id]
  return JSON.stringify({ item, ids })
}

// アノテーションの並びから、プラグイン plugin が足した種類（種類の id の持ち主が plugin）の物を除く（利用者がプラグインを外したときに常駐が消す）
;(globalThis as { matomezuAnnotationsWithout?: (plugin: string, list: string) => string }).matomezuAnnotationsWithout =
  (plugin, list) => {
    const all = restoreAnnotations(JSON.parse(list))
    const kept = all.filter(a => splitId(String(a.annotation)).owner !== plugin)
    return JSON.stringify({ annotations: kept, changed: kept.length !== all.length })
  }

// 利用者トリガートークのときに行うアクション（runsWhenUserTalks）の id（常駐が、アノテーションのある読めるページごとに行う）
;(globalThis as { matomezuTalkActions?: () => string }).matomezuTalkActions = () =>
  JSON.stringify(talkActions(assembled.catalog.core))

// AI が参加を頼むときに行うアクション（runsWhenAIJoins）の id（役 participant と notice。役が揃わなければ null。常駐が MCP の join で行う）
;(globalThis as { matomezuJoinActions?: () => string }).matomezuJoinActions = () =>
  JSON.stringify(joinActions(assembled.catalog.core))

// 参加者のセッションが終わったときに行うアクション（runsWhenAIEnds）の id（無ければ null。常駐が、セッションの終わった参加者を退室させるのに行う）
;(globalThis as { matomezuEndActions?: () => string }).matomezuEndActions = () =>
  JSON.stringify(endActions(assembled.catalog.core))

// 参加者が時点 nowMs（ミリ秒）で生きているか（利用者の設定の参加の有効時間で決まる。常駐が、同じ名前の参加者を引き継げるかを決めるのに読む）
;(
  globalThis as { matomezuParticipantAlive?: (settings: string, calledAt: string, nowMs: number) => boolean }
).matomezuParticipantAlive = (settings, calledAt, nowMs) =>
  isParticipantAlive(assembled.catalog.core, restoreSettings(JSON.parse(settings)), calledAt || undefined, nowMs)

// 参加を利用者に伝える文（利用者の言語。常駐が、UserPromptSubmit のフックの systemMessage に使う）
;(globalThis as { matomezuJoinedText?: (settings: string, workroom: string) => string }).matomezuJoinedText = (
  settings,
  workroom,
) =>
  translate(
    assembled.catalog.core.messages,
    langOf(assembled.catalog.core, restoreSettings(JSON.parse(settings)), "en"),
    JOINED_MESSAGE,
    { name: workroom },
  )

// ビジターとして参加したことを利用者に伝える文（利用者の言語。matomezuJoinedText と同じく、フックの systemMessage に使う）
;(globalThis as { matomezuVisitorJoinedText?: (settings: string) => string }).matomezuVisitorJoinedText = settings =>
  translate(
    assembled.catalog.core.messages,
    langOf(assembled.catalog.core, restoreSettings(JSON.parse(settings)), "en"),
    VISITOR_JOINED_MESSAGE,
  )

// アクションがレコードを対象にするとき、常駐が渡す物: 対象の種類（レコードが対象でなければ null）と、読むだけのブックの id（アクションの readsBooks が引数 args〈JSON〉から答えた物。
// 引数が形に合わなければ空）。常駐が、行う前にどのレコードとブックを渡すかを決めるのに引く
;(globalThis as { matomezuRecordNeeds?: (action: string, args: string) => string }).matomezuRecordNeeds = (
  action,
  args,
) => {
  const def = assembled.catalog.core.actions.get(action)
  const subject = def && assembled.catalog.core.subjects.has(def.target) ? def.target : null
  const books = (() => {
    if (subject === null || !def?.readsBooks) return []
    const parsed = def.args.safeParse(parseOr(args))
    return parsed.success ? [...(def.readsBooks as (args: unknown) => readonly string[])(parsed.data)] : []
  })()
  return JSON.stringify({
    subject,
    books,
  })
}

// JSON の文字 text を読んだ値（読めなければ undefined）
function parseOr(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined
  } catch {
    return undefined
  }
}
// アノテーションの並びから、期限（種類の expiresAt）が時点 now より前の物を除く（kept の id の物は除かない。利用者が直している物）。常駐が時間で消す
;(
  globalThis as { matomezuUnexpired?: (list: string, settings: string, now: string, kept: string) => string }
).matomezuUnexpired = (list, settings, now, kept) => {
  const all = restoreAnnotations(JSON.parse(list))
  const live = unexpired(
    assembled.catalog.core,
    all,
    restoreSettings(JSON.parse(settings)),
    now,
    new Set(JSON.parse(kept) as string[]),
  )
  return JSON.stringify({ annotations: live, changed: live !== all })
}

// 窓が見つけて送ってきた warning（{code, plugin, params} の並び）を、warning の表の 1 行ずつにする（常駐が集めてログと AI に出す）。
// 表に無い番号・形の合わないものは捨てる（窓が作った文は使わない）
const WindowWarningSchema = z.object({
  code: z.string(),
  plugin: z.string(),
  params: z.record(z.string(), z.string()),
})
;(globalThis as { matomezuWarningLines?: (warnings: string) => string }).matomezuWarningLines = warnings => {
  const lines: string[] = []
  for (const raw of z.array(z.unknown()).catch([]).parse(JSON.parse(warnings))) {
    const n = WindowWarningSchema.safeParse(raw)
    if (n.success && Object.hasOwn(WARNINGS, n.data.code))
      lines.push(warningText(warning(n.data.code as keyof typeof WARNINGS, n.data.plugin, n.data.params)))
  }
  return JSON.stringify(lines)
}

// 常駐が呼ぶ口: JSON の文字列で受けて返す
;(globalThis as { matomezuPerform?: (input: string) => string }).matomezuPerform = input =>
  JSON.stringify(perform(JSON.parse(input) as Input))

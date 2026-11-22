// 常駐が受けたアクションバルクを、台帳アセンブルの結果（Assembled）の機能台帳で世界（ブックと設定）に行い、変わったものを返す。
// 台帳アセンブルの結果は、呼ぶたびに引数で受ける。振る id と時点は、受けた物が無ければここで決める

import { actorOfWire, type WireActor } from "../core/actor"
import { type Annotations, restoreAnnotations } from "../core/annotation"
import { findPage, pageById, pagesOf, readLibrary } from "../core/book"
import { bulkActionOf, type LibraryRows, performBulk } from "../core/bulk"
import type { CoreCatalog } from "../core/core-catalog"
import { type ActionOn, type AIEditTicketChange, type AIMessage, stopsOnEditLock } from "../core/def/action"
import { binnedBetween } from "../core/entries"
import { type Library, NO_CHANGES, pageIn } from "../core/folders"
import { bookOf, libraryOf } from "../core/folders-books"
import { createdOn, withChanges } from "../core/folders-changes"
import { atOutsideBinderPlace, atOutsidePagePlace, bookIdOf, outsideBinderIn } from "../core/folders-tree"
import { detectLang } from "../core/i18n/i18n"
import { changedIn } from "../core/ids"
import type { PerformedIn, World } from "../core/perform-world"
import { type Counters, type RecordChange, restoreCounters, restoreRecords } from "../core/records"
import type { Book } from "../core/schema/book"
import { langOf, restoreSettings } from "../core/settings"
import type { Assembled } from "../store/plugin"
import { hostSource, withKeys } from "./records"
import { type RowChange, rowChanges } from "./wire"

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

export interface Input {
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
// created はそのうち新しく足した物の id（常駐が、世界のどこにも無い id かを確かめる）、books は変わったブックの id（変わったページ・フォルダを持つブック。無くなったブックと、ゴミ箱に出入りしたブックも）、trashing は新しくゴミ箱に入るステージエントリ（ブックと、ブックの外のページ・バインダ）の id、annotations はアノテーションが変わったページの id → 新しい並び（空なら全部無くなった）、
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
      at?: number
    } // at は断られたアクションが何番目か

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
  "no-page": "there is no page with that id (on.page is the id of a page; read_book and read_folder list pages)",
  "no-record": "there is no record with that id (on.record is the id of a record of the action's subject)",
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
  return { ok: false, reason: done.reason, ...kind, detail: AI_REFUSALS[done.reason] }
}

export function perform(of: Assembled, input: Input): Output {
  const { controlCenter } = of
  const catalog = of.catalog.core
  const settings = restoreSettings(input.settings)
  const langFor = (l: string | undefined) =>
    l ? detectLang([l], [...catalog.languages.keys()]) : langOf(catalog, settings, "en")
  const read = readLibrary(catalog, input.pages ?? [], input.folders ?? [])
  const books = Object.fromEntries(read.books.map(b => [b.id, b]))
  const annotations = Object.fromEntries(
    Object.entries(input.annotations ?? {}).map(([page, list]) => [page, restoreAnnotations(list)]),
  )
  const records = restoreRecords(input.records)
  const counters = restoreCounters(input.counters)
  const actor = actorOfWire(input.actor)
  const source = hostSource(records)
  const tables = read.library
  const world = { ...tables, settings, annotations, records, counters, ...(source ? { source } : {}) }
  // 時点が渡されなかったアクションの時点（その日付も、bulkActionOf がこの同じ時点から決める）
  const at = new Date().toISOString()
  const steps = input.actions.map(a => bulkActionOf(a, () => crypto.randomUUID(), at, langFor(a.lang)))
  // AI のアクションと、利用者でも編集ロックで断るアクションは、利用者が直している物を変えも消しもしない（あとでやり直す）。バルクの中のアクションごとに見る。
  // レコードが対象のアクションは、変えるレコードのどれかを直しているなら、同じように断る（作るレコードは新しい id なので、直してはいない）。
  // フォローステップが応じて変えたレコードは、利用者のアクションでも断る
  const done = performBulk(
    world,
    steps,
    { catalog, controlCenter, lang: langFor(input.actions[0]?.lang), actor },
    (i, before, after, one) => {
      const edited = (c: { subject: string; id: string }) => (input.watchedRecords?.[c.subject] ?? []).includes(c.id)
      if ((one.followed ?? []).some(edited)) return { ok: false as const, reason: "being-edited" as const }
      if (!stopsOnEditLock(catalog.actions.get(input.actions[i]?.action ?? ""), actor)) return undefined
      const editedRecord = (one.records ?? []).some(edited)
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
  const trashingBooks = binned.trashed.filter(id => id in next)
  // ゴミ箱に入った、ブックの外のページとバインダ（入る前の置き場所で見る。中に持つフォルダごと入ったときも）
  const trashingPages = binned.trashed.filter(
    id => atOutsidePagePlace(tables.folders, id) || atOutsideBinderPlace(tables.folders, id),
  )
  const restoring = binned.restored.filter(id => id in next)
  const notice = [shiftNotice(books, changed, tables, after), followedNotice(done.followed ?? [])]
    .filter(n => n !== null)
    .join(" ")
  const changes = done.changes ?? NO_CHANGES
  return {
    ok: true,
    result: done.results.at(-1),
    pages: rowChanges(changes.pages),
    folders: rowChanges(changes.folders),
    created: createdOn(tables, changes),
    books: [...new Set([...changed.map(b => b.id), ...removed, ...trashingBooks, ...restoring])],
    trashing: [...trashingBooks, ...trashingPages],
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

// アクション 1 つが、利用者が直している物 watched（ブックの中の物・ブックの外のバインダ・ページの中の物とそのページのアノテーション。ページはブックの中でも外でも）を変えたか消した所（before と after はそのアクションの前と後の世界、changedAnnotations はそのアクションが変えたアノテーション）
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
    // ブックの外のバインダの中の物（バインダそのもの）
    const binder = outsideBinderIn(before, id)
    if (binder) return changedIn(binder, outsideBinderIn(after, id), list)
    // ページの中の物と、そのページのアノテーション（ブックの中のページなら、そのページを持っているブックだけを組む）
    const holder = bookIdOf(before.folders, id)
    const held = holder ? bookOf(before, holder) : undefined
    const at = held ? pageById({ [held.id]: held }, id) : undefined
    const page = holder === undefined ? pageIn(before.pages, id) : at?.page
    if (!page) return []
    const book = at ? bookOf(after, at.book.id) : undefined
    const pageNow = at ? book && findPage(book, id)?.page : pageIn(after.pages, id)
    const annotationsNow =
      changedAnnotations && id in changedAnnotations ? changedAnnotations[id] : before.annotations[id]
    return changedIn(
      { page, annotations: before.annotations[id] },
      { page: pageNow, annotations: annotationsNow },
      list,
    )
  })
}

// 中身をずらした可変ページ（ページの shift が変わった）があれば、AI への知らせ（位置が変わったので読み直す）。
// ブックの中のページは、前のブック before と変わったブック changed から、ブックの外のページは、前の表 was と後の表 now から見る
function shiftNotice(
  before: Readonly<Record<string, Book>>,
  changed: readonly Book[],
  was: Library,
  now: Library,
): string | null {
  const NO_SHIFT = { x: 0, y: 0 }
  const shiftOf = (b: Book | undefined, page: string) => (b ? findPage(b, page)?.page.shift : undefined) ?? NO_SHIFT
  const line = (from: { x: number; y: number }, to: { x: number; y: number }, at: string) => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    return dx || dy ? [`${at} by ${dx} paper(s) right and ${dy} down`] : []
  }
  const inBooks = changed.flatMap(b =>
    pagesOf(b).flatMap(p => line(shiftOf(before[b.id], p.id), shiftOf(b, p.id), `page ${p.id} of book ${b.id}`)),
  )
  const outside = Object.keys(now.pages).flatMap(id => {
    const page = now.pages[id]
    if (page === was.pages[id] || page?.kind !== "page" || bookIdOf(now.folders, id) !== undefined) return []
    return line(pageIn(was.pages, id)?.shift ?? NO_SHIFT, page.shift ?? NO_SHIFT, `page ${id}`)
  })
  const moved = [...inBooks, ...outside]
  return moved.length
    ? `The contents of a variable page were shifted by whole papers, so every position there changed (${moved.join("; ")}); read_page before using positions.`
    : null
}

// フォローステップが応じて変えたレコードがあれば、AI への知らせ（アクションのほかに変わった物）
function followedNotice(followed: readonly { subject: string; id: string }[]): string | null {
  return followed.length
    ? `Follow steps changed these records along with it: ${followed.map(f => `${f.subject} ${f.id}`).join(", ")}.`
    : null
}

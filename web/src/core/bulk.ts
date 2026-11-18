// アクションバルク: 同期の 1 回の流れで行ったアクションの並び。順に行い、全部通るか全部断られ、変わった物は 1 つに合わせて 1 回で書く。
// 画面の行い直し（store の receive）と常駐のエンジンが、ここの performBulk で行う（画面がその場で行うのは、アクション 1 つずつの performIn）

import { type Annotations, withAnnotations } from "./annotation"
import type { CoreCatalog } from "./core-catalog"
import type { ActionContext, ActionOn, AIEditTicketChange, AIMessage } from "./def/action"
import { type Folder, type PageRow, type TableChanges, withChanges } from "./folders"
import { type HistoryStep, type RowChange, rowChangesOf } from "./history"
import { type PerformedIn, performIn, type World } from "./perform"
import { keyValuesOf } from "./record-keys"
import { type RecordSource, sourceOf } from "./record-source"
import { type Counters, REMOVED, type RecordChange, withCounters, withRecords } from "./records"
import type { Settings } from "./settings"

// バルクの中のアクション 1 つ: アクションと引数と宛先、そのアクションの id の振り方・時点・言語
export interface BulkAction {
  action: string
  args: unknown
  on?: ActionOn
  newId(): string
  now: string
  lang?: ActionContext["lang"]
}

// 送られたアクション 1 つ（行ったときに振った id の並び ids と時点 now を持つ）を、行う形にする。id が尽きたら spareId で振り、時点が無ければ now
export function bulkActionOf(
  sent: {
    action: string
    args: unknown
    on?: ActionOn | undefined
    ids?: readonly string[] | undefined
    now?: string | undefined
  },
  spareId: () => string,
  now: string,
  lang?: ActionContext["lang"],
): BulkAction {
  const ids = [...(sent.ids ?? [])]
  return {
    action: sent.action,
    args: sent.args,
    ...(sent.on ? { on: sent.on } : {}),
    newId: () => ids.shift() ?? spareId(),
    now: sent.now ?? now,
    ...(lang ? { lang } : {}),
  }
}

type Done = Extract<PerformedIn, { ok: true }>
type NotDone = Exclude<PerformedIn, { ok: true }>

// AI 編集チケットの変え方 1 つと、それを返したアクションの対象の種類（変え方は種類ごとに当てる）
export interface BulkTicketChange {
  subject: string
  change: AIEditTicketChange
}

// 書庫の画面の履歴に入るアクションか（書庫が対象で、画面の履歴に入れない印 history: false の無いアクション。ほかのアクションの変更は、ブックの画面の履歴に入る）
export const entersLibraryHistory = (action: { target: string; history?: false } | undefined): boolean =>
  action?.target === "library" && action.history !== false

// アクションバルクのうち、書庫の画面の履歴に入るアクションが変えたページとフォルダごとの、前と後（そのアクションの前の値から、最後のそのアクションの後の値へ。
// 同じ物をほかのアクションも変えていたら、その分は入らない）
export type LibraryRows = Pick<HistoryStep, "pages" | "folders">

export const NO_LIBRARY_ROWS: LibraryRows = { pages: {}, folders: {} }

// performBulk の結果。library は、changes のうち書庫の画面の履歴に入るアクションが変えた物（無ければ持たない）。通れば、アクションごとの結果と、合わせた変更（ページとフォルダは最初の前から最後の後へ。バルクの中で作って消した物は持たない）
export type PerformedBulk<R = never> =
  | {
      ok: true
      results: readonly unknown[]
      changes?: TableChanges
      library?: LibraryRows
      settings?: Settings
      annotations?: Annotations
      records?: readonly RecordChange[]
      counters?: Counters
      aiEditTickets?: readonly BulkTicketChange[]
      aiMessages?: readonly AIMessage[]
    }
  | ((NotDone | R) & { at: number })

// アクション 1 つを行った後に、そのアクションを断るかを問う所（常駐の編集ロックなど。before と after はそのアクションの前と後の世界）
export type BulkCheck<R> = (i: number, before: World, after: World, done: Done) => R | undefined

// world の上で steps を順に行う。前のアクションが変えた物は、あとのアクションから変えた後の値で見える（レコードの読み口にも重ねる）。
// どれかが断られたら（check が断っても）、何番目か（at）と断りを返し、何も変えない
export function performBulk<R extends { ok: false } = never>(
  world: World,
  steps: readonly BulkAction[],
  ctx: Omit<ActionContext, "newId" | "now">,
  check?: BulkCheck<R>,
): PerformedBulk<R> {
  const base = world.source ?? sourceOf(world.records)
  let now = world
  let written: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {} // バルクの中で書いたレコード（種類 → id → レコードか REMOVED）
  const results: unknown[] = []
  let pages: Record<string, TableChanges["pages"][string]> = {}
  let folders: Record<string, TableChanges["folders"][string]> = {}
  let settings: Settings | undefined
  let annotations: Annotations | undefined
  let records: RecordChange[] = []
  let counters: Counters | undefined
  const tickets: BulkTicketChange[] = []
  const messages: AIMessage[] = []
  const libraryPages: Record<string, RowChange<PageRow>> = {}
  const libraryFolders: Record<string, RowChange<Folder>> = {}
  for (const [i, step] of steps.entries()) {
    const done = performIn({ ...now, source: overlaid(ctx.catalog, base, written) }, step.action, step.args, step.on, {
      ...ctx,
      ...(step.lang ? { lang: step.lang } : {}),
      newId: () => step.newId(),
      now: step.now,
    })
    if (!done.ok) return { ...done, at: i }
    const after: World = {
      ...(done.changes ? withChanges(now, done.changes) : now),
      settings: done.settings ?? now.settings,
      annotations: withAnnotations(now.annotations, done.annotations),
      records: withRecords(now.records, done.records ?? []),
      counters: withCounters(now.counters, done.counters),
    }
    const refused = check?.(i, now, after, done)
    if (refused) return { ...refused, at: i }
    results.push(done.result)
    if (done.changes) {
      pages = { ...pages, ...done.changes.pages }
      folders = { ...folders, ...done.changes.folders }
      if (entersLibraryHistory(ctx.catalog.actions.get(step.action))) {
        const rows = rowChangesOf(now, done.changes)
        for (const [id, r] of Object.entries(rows.pages))
          libraryPages[id] = { before: libraryPages[id]?.before ?? r.before, after: r.after }
        for (const [id, r] of Object.entries(rows.folders))
          libraryFolders[id] = { before: libraryFolders[id]?.before ?? r.before, after: r.after }
      }
    }
    if (done.settings) settings = done.settings
    if (done.annotations) annotations = { ...annotations, ...done.annotations }
    if (done.records) {
      for (const c of done.records)
        written = { ...written, [c.subject]: { ...(written[c.subject] ?? {}), [c.id]: c.record } }
      const replaced = new Set(done.records.map(c => `${c.subject}\n${c.id}`))
      records = [...records.filter(c => !replaced.has(`${c.subject}\n${c.id}`)), ...done.records]
    }
    if (done.counters) counters = withCounters(counters ?? {}, done.counters)
    const subject = ctx.catalog.actions.get(step.action)?.target ?? ""
    for (const change of done.aiEditTickets ?? []) tickets.push({ subject, change })
    messages.push(...(done.aiMessages ?? []))
    now = after
  }
  // 作って消したページ・フォルダ・レコードは、前も後も無いので持たない
  const kept = <T>(rows: Record<string, T | typeof REMOVED>, had: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(Object.entries(rows).filter(([id, r]) => r !== REMOVED || id in had))
  const changes = { pages: kept(pages, world.pages), folders: kept(folders, world.folders) }
  const keptRecords = records.filter(c => c.record !== REMOVED || base.byId(c.subject, c.id) !== undefined)
  const changed = Object.keys(changes.pages).length > 0 || Object.keys(changes.folders).length > 0
  // 書庫の画面の履歴に入るアクションが作って消した物は、前も後も無いので持たない
  const changedRows = <T>(rows: Record<string, RowChange<T>>) =>
    Object.fromEntries(Object.entries(rows).filter(([, r]) => r.before !== "none" || r.after !== "none"))
  const library = { pages: changedRows(libraryPages), folders: changedRows(libraryFolders) }
  return {
    ok: true,
    results,
    ...(changed ? { changes } : {}),
    ...(Object.keys(library.pages).length + Object.keys(library.folders).length > 0 ? { library } : {}),
    ...(settings ? { settings } : {}),
    ...(annotations ? { annotations } : {}),
    ...(keptRecords.length > 0 ? { records: keptRecords } : {}),
    ...(counters ? { counters } : {}),
    ...(tickets.length > 0 ? { aiEditTickets: tickets } : {}),
    ...(messages.length > 0 ? { aiMessages: messages } : {}),
  }
}

// 読み口 base に、バルクの中で書いたレコード written（REMOVED は消した）を重ねた読み口
function overlaid(
  catalog: CoreCatalog,
  base: RecordSource,
  written: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): RecordSource {
  if (Object.keys(written).length === 0) return base
  const mine = (subject: string) => written[subject] ?? {}
  const live = (subject: string) => Object.fromEntries(Object.entries(mine(subject)).filter(([, r]) => r !== REMOVED))
  const without = <T>(subject: string, rows: Readonly<Record<string, T>>) =>
    Object.fromEntries(Object.entries(rows).filter(([id]) => !(id in mine(subject))))
  return {
    byId: (subject, id) => {
      const r = mine(subject)[id]
      return r === undefined ? base.byId(subject, id) : r === REMOVED ? undefined : r
    },
    candidates: (subject, where) => ({ ...without(subject, base.candidates(subject, where)), ...live(subject) }),
    ...(base.keys
      ? {
          keys: (subject: string, where: Parameters<NonNullable<RecordSource["keys"]>>[1]) => {
            const def = catalog.subjects.get(subject)
            const own = Object.fromEntries(
              Object.entries(live(subject)).map(([id, r]) => [id, def ? keyValuesOf(def, r) : {}]),
            )
            return { ...without(subject, base.keys?.(subject, where) ?? {}), ...own }
          },
        }
      : {}),
  }
}

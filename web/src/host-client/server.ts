// ホストに頼むホストクライアント: 画面は自分で先にアクションを行い、同じアクションを常駐に送る（POST /api/perform）。
// 常駐はアクションを 1 つずつ順に行い、変わったブックと設定をつながっている全部の画面に知らせる（/api/events。internal/server/hub.go）。
// 画面は、常駐が決めた世界（確かめた世界）の上で、まだ確かめられていない自分のアクションを行い直したものを出す（store の receive）。
// 自分のアクションは、その番号（seq）が知らせに返ってきたら確かめ終わり。断られたものは行い直さないので、画面から消える。observe は、常駐の答え（ack の ok と reason）を返す。
// アクションは 1 つずつ順に送る。届かなかったもの（送れなかった・常駐が 5xx を返した）は消さずに送り直し、つなぎ直したら、確かめられていないものを全部
// 新しいつながりで送り直す（つながりは窓の中で振る番号で見分ける。常駐の窓の id は、常駐を起動し直すと前と同じ物がまた振られる）。常駐が同じアクションを二度行わないように、アクションごとに一意の番号（key）を振り、送り直しても変えない。
// 送り直しても届かなかったものだけを外してトーストで知らせる。つながりが OFFLINE_MS より長く切れたままなら store に知らせる（setOffline）。
// つながっていない間も画面の編集は止めず、つながったらまとめて送る。
// つなぎ直しはブラウザに任せるが、スリープなどで黙って切れたつながりはブラウザが気づかないので、知らせ（常駐が送る keep も）が QUIET_MS 届かなければ、自分で閉じてつなぎ直す。
// スリープの間は待ちが進まないことがあるので、窓がフォーカスされたときにも、壁時計で QUIET_MS 過ぎていれば、すぐつなぎ直す。
// 窓が見ているもの（ステージごとのブックとページ、カレントのステージの選択）と、窓がフォーカスされたことも知らせる（AI が「今の画面」を知るため）。
// 常駐から「ブックを出して」（show）と届いたら、言われたステージ（分けるなら、分けてできたステージ）でそのブックを開く。
// 常駐が足した追加プラグインは、読むときに見た目の JS を import() して、default で出したものを渡す（CSS も読む）。
// 追加プラグインが変わったと届いたら（plugins）、画面を読み直す（台帳アセンブルし直すため）。
// つながりが切れた・読み直せなかった・古い版を捨てたなどは、常駐のログにも書き残す（POST /api/log。切れている間の分は、つながってから送る）

import { z } from "zod"
import type { CoreCatalog } from "../core/core-catalog"
import { fail, matomezuError, problem } from "../core/errors"
import { BROKEN, MOVED_CODES, rawBooksOf } from "../core/folders"
import { restoreCounters, restoreRecords, withCounters, withRecords } from "../core/records"
import type { Stage } from "../core/stage"
import { NOT_INSIDE, PURGED, type UnreadableNotice } from "../core/unreadable"
import type { Warning } from "../core/warnings"
import { currentKindOf, recentBookScreen, screenOfStage, shownScreens } from "../core/window"
import { currentStage, MAX_STAGES } from "../core/workspace"
import { NO_STAGE } from "../store/dialogs"
import type {
  AIEditTicketOutcome,
  DoneBulk,
  ForeignChange,
  HostAnswer,
  MatomezuInstance,
  MatomezuState,
  ParticipantLive,
} from "../store/store"
import type { HostClient, Loaded } from "./client"
import { WIDE_SEARCH_ANSWER, wideSearchParams } from "./search"

// 常駐が答えなかった（常駐から開いていない）
export class NoServer {}

// 外とのやり取り（テストでは差し替える）
export interface Net {
  fetch(url: string, init?: RequestInit): Promise<Response>
  events(url: string): Events
  focused(): boolean // 窓がフォーカスされているか
  onFocus(listener: () => void): () => void // 窓がフォーカスされたら呼ぶ。止める関数を返す
  visible(): boolean // 窓が見えているか（裏のタブでないか）
  onVisible(listener: () => void): () => void // 窓が見えるようになったら呼ぶ。止める関数を返す
  importModule(url: string): Promise<{ default?: unknown }> // ES モジュールを読む
  addStyle(url: string): void // CSS を読む
  // 画面を読み直す。carry を渡すと、読み直したあとの窓の carried が 1 回だけそれを返す（そのタブの sessionStorage に置く）
  reload(carry?: string): void
  carried(): string | undefined // 読み直す前の窓が reload に渡した物（読んだら消す。無ければ undefined）
  later(run: () => void, ms: number): () => void // ms 後に run を呼ぶ。取り消す関数を返す
  newKey(): string // アクションの一意の番号
  now(): number // 壁時計の時刻（ミリ秒。スリープの間も進む）
}
export interface Events {
  on(name: string, listener: (data: string) => void): void
  onError(listener: () => void): void
  close(): void
}

// 読み直しをまたいで運ぶ物（読み直す前に知らされた、読めない物のフォルダへ移った・戻った物の知らせ）の、sessionStorage の鍵
const CARRY_KEY = "matomezu:unreadable-notice"

const browserNet: Net = {
  fetch: (url, init) => fetch(url, init),
  events: url => {
    const source = new EventSource(url)
    return {
      on: (name, listener) => source.addEventListener(name, e => listener((e as MessageEvent<string>).data)),
      onError: listener => {
        source.onerror = listener
      },
      close: () => source.close(),
    }
  },
  focused: () => document.hasFocus(),
  onFocus: listener => {
    window.addEventListener("focus", listener)
    return () => window.removeEventListener("focus", listener)
  },
  visible: () => document.visibilityState !== "hidden",
  onVisible: listener => {
    const changed = () => document.visibilityState !== "hidden" && listener()
    document.addEventListener("visibilitychange", changed)
    return () => document.removeEventListener("visibilitychange", changed)
  },
  importModule: url => import(new URL(url, document.baseURI).href),
  addStyle: url => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = url
    document.head.append(link)
  },
  reload: carry => {
    if (carry !== undefined) sessionStorage.setItem(CARRY_KEY, carry)
    window.location.reload()
  },
  carried: () => {
    const kept = sessionStorage.getItem(CARRY_KEY)
    sessionStorage.removeItem(CARRY_KEY)
    return kept ?? undefined
  },
  later: (run, ms) => {
    const timer = setTimeout(run, ms)
    return () => clearTimeout(timer)
  },
  newKey: () => crypto.randomUUID(),
  now: () => Date.now(),
}

const RETRY_MS = 2000 // 届かなかったアクションを送り直すまで
const MAX_TRIES = 3 // 常駐が 5xx を返したアクションを送る回数（超えたら外す）
export const OFFLINE_MS = 10_000 // つながりがこれより長く切れたままなら、切れていると見せる
export const QUIET_MS = 60_000 // 知らせ（keep も）がこれより長く届かなければ、つながりが黙って切れたとみてつなぎ直す（常駐は 25 秒ごとに keep を送る）
const MAX_LOG_LINES = 50 // 常駐に送れずに溜めておく、ログの行の数（超えたら古い方を捨てる。常駐が一度に受ける行の数と同じ）

// まだ確かめられていない自分のアクションバルク。sentTo は送り届けたつながりの番号（まだなら 0）、tries は常駐が 5xx を返した回数
interface Pending {
  seq: number
  key: string
  done: DoneBulk
  sentTo: number
  tries: number
  answer: (a: HostAnswer) => void // 常駐の答えを observe に返す
}

// 参加者の様子のうち、空でない物（モデルもブランチも無ければ undefined）
const liveOf = (v: { model?: string | undefined; branch?: string | undefined }): ParticipantLive | undefined =>
  v.model || v.branch
    ? { ...(v.model ? { model: v.model } : {}), ...(v.branch ? { branch: v.branch } : {}) }
    : undefined

const openedOf = (stage: Stage) => {
  const opened = stage.opened
  return {
    book: opened?.outermost ?? null,
    page: opened && "page" in opened ? (opened.page ?? null) : null,
    mode: stage.mode.kind,
  }
}

// 窓が見ているもの。current はカレントスクリーンの種類（ステージを並べるスクリーンなら book-screen、そうでなければ control-center）。
// book・page・mode（編集か印刷プレビューか）・selection は、いちばん最近カレントにしたブックスクリーンの、カレントのステージのもの（何も開いていなければ book は null）。
// そのブックスクリーンが見えているスクリーンでなければ、それらを hidden に分けて添える（見えていない物として、常駐は開いたことにしない）。
// ブックスクリーンが 1 枚も無ければ、bookScreen が NO_BOOK_SCREEN
export const NO_BOOK_SCREEN = "none"
export function viewOf(catalog: CoreCatalog, state: MatomezuState) {
  const current = currentKindOf(state.window)
  const book = recentBookScreen(state.window)
  if (!book) return { current, bookScreen: NO_BOOK_SCREEN }
  const ws = book.stages
  const stage = currentStage(ws)
  const screen = {
    ...openedOf(stage),
    selection: stage.selection,
    stage: stage.id,
    stages: ws.stages.map(s => ({ id: s.id, ...openedOf(s) })),
    canSplit: ws.stages.length < MAX_STAGES,
  }
  // そのブックスクリーンが見えていなければ、見えていない物として分ける
  return shownScreens(catalog, state.window).includes(book.id) ? { current, ...screen } : { current, hidden: screen }
}

// 利用者が直している物（useEditLock）を、ページかブックの id → その中の物の id の並びにまとめたもの（常駐はこれを変える AI のアクションを断る）
export const editLocksOf = (state: MatomezuState): Record<string, string[]> =>
  groupLocks(state, l => ("within" in l ? l.within : undefined))

// 利用者が直しているレコード（useRecordEditLock）を、対象の種類の id → レコードの id の並びにまとめたもの（常駐はこれを変える AI のアクションを断る）
export const recordLocksOf = (state: MatomezuState): Record<string, string[]> =>
  groupLocks(state, l => ("subject" in l ? l.subject : undefined))

// 利用者が直している物を、keyOf が答えた id ごとに、直している物の id の並び（重なりを除く）にまとめる（答えない物は入れない）
function groupLocks(
  state: MatomezuState,
  keyOf: (lock: MatomezuState["editLocks"][string]) => string | undefined,
): Record<string, string[]> {
  const locks: Record<string, string[]> = {}
  for (const l of Object.values(state.editLocks)) {
    const key = keyOf(l)
    if (key === undefined) continue
    const now = locks[key] ?? []
    locks[key] = [...now, ...l.ids.filter(id => !now.includes(id))]
  }
  return locks
}

const ShowSchema = z.object({
  book: z.string(),
  page: z.string().optional(),
  stage: z.string().optional(),
  split: z.boolean().optional(),
  mode: z.enum(["edit", "print-preview"]).optional(),
})

// 常駐が頼んだブックを出す。ステージも split も言わなければ、窓に出す（showBook: もう開いていればカレントスクリーンにし、無ければ新しいブックスクリーン）。
// ステージを言えばそのステージに、split なら分けて右にできたステージに出す。mode が print-preview なら、印刷プレビューで出す
export function showIn(instance: MatomezuInstance, show: z.infer<typeof ShowSchema>) {
  const { actions, state } = instance
  const stage = show.stage === undefined && !show.split ? shownStage(instance, show) : placedStage(instance, show)
  if (stage === undefined) return
  const book = state.getState().books[show.book]
  if (show.mode === "print-preview" && book) actions.openPrintPreview(stage)
}

// ブックを窓に出して、出したステージを答える
function shownStage({ actions }: MatomezuInstance, show: z.infer<typeof ShowSchema>): string | undefined {
  const stage = actions.showBookStage(show.book, show.page)
  return stage === NO_STAGE ? undefined : stage
}

// ブックを、言われたステージ（split なら、分けて右にできたステージ）に出して、出したステージを答える
function placedStage({ actions, state }: MatomezuInstance, show: z.infer<typeof ShowSchema>): string | undefined {
  let stage = show.stage ?? recentBookScreen(state.getState().window)?.stages.current
  if (stage === undefined) return undefined
  if (show.split) {
    const before = (screenOfStage(state.getState().window, stage)?.stages.stages ?? []).map(s => s.id)
    const from = stage
    actions.split(from)
    const added = screenOfStage(state.getState().window, from)?.stages.stages.find(s => !before.includes(s.id))
    if (!added) return undefined
    stage = added.id
  }
  const to = stage
  actions.openBook(to, show.book)
  if (show.page) actions.openPage(to, show.page)
  return to
}

// POST api/screen-plugins/remove の答え
const SCREEN_PLUGINS_REMOVED = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), id: z.string(), reason: z.string() }),
])

const PURGE_ANSWER = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.literal(NOT_INSIDE) }),
])
const MOVED_IF_OFF_ANSWER = z.union([
  z.object({
    ok: z.literal(true),
    moved: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(["page", "binder", "book", "folder"]),
        holder: z.string(),
        code: z.enum(MOVED_CODES),
        type: z.string().optional(),
      }),
    ),
  }),
  z.object({ ok: z.literal(false), reason: z.literal(BROKEN) }),
])

const NoticeSchema = z.object({
  moved: z.array(z.object({ code: z.enum(MOVED_CODES), type: z.string().optional(), count: z.number().int() })),
  returned: z.number().int(),
})
const PluginsSchema = z.object({
  moved: NoticeSchema.shape.moved.optional(),
  returned: z.number().int().optional(),
  by: z.string().optional(),
})
// 読み直す前の窓が運んだ知らせ carried（形に合わなければ無い）
function noticeOf(carried: string | undefined): UnreadableNotice | undefined {
  if (carried === undefined) return undefined
  try {
    const read = NoticeSchema.parse(JSON.parse(carried))
    return { ...read, moved: read.moved.map(({ type, ...m }) => (type === undefined ? m : { ...m, type })) }
  } catch {
    return undefined
  }
}

const DataSchema = z.object({
  pages: z.array(z.object({ id: z.string(), page: z.unknown(), version: z.number().int() })),
  folders: z.array(z.object({ id: z.string(), folder: z.unknown(), version: z.number().int() })),
  settings: z.unknown(),
  annotations: z.record(z.string(), z.unknown()).optional(),
  records: z.unknown().optional(),
  counters: z.unknown().optional(),
  plugins: z
    .array(z.object({ id: z.string(), ui: z.string(), css: z.string().optional(), disabled: z.boolean().optional() }))
    .optional(),
  touched: z.record(z.string(), z.string()).optional(),
  participantCalls: z.record(z.string(), z.string()).optional(),
  participantReady: z.array(z.string()).optional(),
  participantLive: z
    .record(z.string(), z.object({ model: z.string().optional(), branch: z.string().optional() }))
    .optional(),
})
const HelloSchema = z.object({ client: z.string() })
const Mark = { client: z.string().optional(), seq: z.number().int().optional() }
// 変わったページ・フォルダ 1 つ（消したなら removed が true で、中身と版は無い）
const rowSchema = <K extends "page" | "folder">(field: K) =>
  z.object({ id: z.string(), version: z.number().int().optional(), removed: z.literal(true).optional() }).extend({
    [field]: z.unknown().optional(),
  } as Record<K, z.ZodOptional<z.ZodUnknown>>)
// 1 回の perform（アクションバルク）が変えた物の全部: ページとフォルダ（books は、それらを持つブックの id）と、変わったときだけ設定・アノテーション（ページの id → 並び）・
// レコードと進めた番号（window は最後にフォーカスされた窓）。actions は行ったアクションの id の並び、library は、書庫の履歴に入るアクションが変えたページとフォルダごとの前と後（無い側は none）
// ページ・フォルダ 1 つの、前と後（置き場所の形のまま。無い側は none）
const RowSides = z.object({ before: z.unknown(), after: z.unknown() })
const ChangedSchema = z.object({
  pages: z.array(rowSchema("page")),
  folders: z.array(rowSchema("folder")),
  books: z.array(z.string()),
  library: z.object({ pages: z.record(z.string(), RowSides), folders: z.record(z.string(), RowSides) }).optional(),
  by: z.enum(["ai", "window", "host"]).optional(),
  act: z.string().optional(),
  actions: z.array(z.string()).optional(),
  settings: z.unknown().optional(),
  annotations: z.record(z.string(), z.unknown()).optional(),
  records: z.array(z.object({ subject: z.string(), id: z.string(), record: z.unknown() })).optional(),
  counters: z.record(z.string(), z.record(z.string(), z.number())).nullish(),
  window: z.string().optional(),
  ...Mark,
})
const AckSchema = z.object({ seq: z.number().int(), ok: z.boolean(), reason: z.string() })
const ParticipantCallSchema = z.object({ participant: z.string(), at: z.string() })
const ParticipantReadySchema = z.object({ participant: z.string() })
const ParticipantLiveSchema = z.object({
  participant: z.string(),
  model: z.string().optional(),
  branch: z.string().optional(),
})
const TouchedSchema = z.object({ book: z.string(), at: z.string() })
const AnnotationsSchema = z.object({ page: z.string(), annotations: z.unknown() })

export function serverClient(net: Net = browserNet): HostClient {
  // 確かめた世界のページとフォルダ（id → 置き場所から読んだままの中身と版）
  type Rows = Map<string, { row: unknown; version: number }>
  const confirmed: { pages: Rows; folders: Rows } = { pages: new Map(), folders: new Map() }
  let settings: unknown
  let annotations: Record<string, unknown> = {} // ページの id → アノテーションの並び
  let records: unknown = {} // 対象の定義が足した種類のレコード（種類の id → id → レコード）
  let counters: unknown = {} // 番号を振る種類の、区切りごとの次の番号
  let touched: Record<string, string> = {} // ブックの id → 触れた（開いたか書いた）時刻
  let participantCalls: Record<string, string> = {} // 参加者の id → 最後に呼ばれた時刻
  let participantReady: string[] = [] // 準備中でない参加者の id（増えるだけ）
  let participantLive: Record<string, ParticipantLive> = {} // 参加者の id → モデルとブランチ（どちらも無い参加者は持たない）
  let plugins: { id: string; ui: string; css?: string; disabled?: boolean }[] = []
  let pending: Pending[] = []
  let client = ""
  let link = 0 // 今のつながりの番号（hello のたびに増やす）
  let online = false // 知らせにつながっているか
  let sending = false // 送っている途中か（1 つずつ順に送る）
  let retry: (() => void) | null = null // 送り直しの待ち（取り消す関数）
  let offlineTimer: (() => void) | null = null // 切れていると見せるまでの待ち
  let warnings: readonly Warning[] = [] // 画面が見つけた warning（つなぎ直すたびに知らせ直す）
  const tellWarnings = () => {
    if (!client) return
    void net
      .fetch("api/warnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client, warnings }),
      })
      .catch(() => {})
  }
  let aiEditTickets: AIEditTicketOutcome[] = [] // 常駐にまだ送っていない、AI の変更を見た・見られる前に消えたこと
  // 溜めた物を 1 つずつ常駐に送る。送れなかった・常駐が 5xx を返したら戻して、次に送るときに送る（4xx なら捨てる。一度きりの出来事なので、送れないまま捨てない）
  const tellAIEditTickets = async () => {
    while (online && client && aiEditTickets.length > 0) {
      const [next, ...rest] = aiEditTickets as [AIEditTicketOutcome, ...AIEditTicketOutcome[]]
      aiEditTickets = rest
      const res = await net
        .fetch("api/ai-edit-tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        })
        .catch(() => null)
      if (!res || res.status >= 500) {
        aiEditTickets = [next, ...aiEditTickets]
        return
      }
    }
  }
  let logLines: { at: string; text: string }[] = [] // 常駐のログにまだ送っていない行
  // 溜めた行を常駐のログに送る。送れなかった・常駐が 5xx を返したら戻して、次に送るときに一緒に送る（4xx なら捨てる）
  const tellLog = () => {
    if (!online || !client || logLines.length === 0) return
    const lines = logLines
    logLines = []
    const back = () => {
      logLines = [...lines, ...logLines].slice(-MAX_LOG_LINES)
    }
    void net
      .fetch("api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client, lines }),
      })
      .then(res => res.status >= 500 && back(), back)
  }
  // 画面のコンソールに出し、常駐のログにも書き残す（Error は名前と文、ほかの物は型の名前で書く）
  const logLine = (text: string, ...more: unknown[]) => {
    console.warn(text, ...more)
    const words = more.map(m =>
      m instanceof Error ? `${m.name}: ${m.message}` : typeof m === "object" && m ? m.constructor.name : String(m),
    )
    logLines = [...logLines, { at: new Date().toISOString(), text: [text, ...words].join(" ") }].slice(-MAX_LOG_LINES)
    tellLog()
  }
  let retell: (() => void) | null = null // 見ているものを知らせ直す（connect で作る。常駐は窓の見ているものをつながりごとに持つので、つなぎ直したら知らせ直す）
  let seq = 0
  let instance: MatomezuInstance | null = null
  let events: Events | null = null

  // change は、この窓のでない変更の知らせのとき（その変更を、まだ見ていない画面の履歴の段にする）
  const show = (change?: ForeignChange) =>
    instance?.receive(
      {
        pages: [...confirmed.pages.values()].map(e => e.row),
        folders: [...confirmed.folders.values()].map(e => e.row),
        settings,
        annotations,
        records,
        counters,
        touched,
        participantCalls,
        participantReady,
        participantLive,
      },
      pending.map(p => p.done),
      change,
    )
  // ページ page のアノテーションを list にした、ページごとのアノテーション（空の並びなら、そのページを持たない）
  const withPageAnnotations = (page: string, list: unknown) => {
    const { [page]: _, ...rest } = annotations
    return Array.isArray(list) && list.length === 0 ? rest : { ...rest, [page]: list }
  }
  // 番号 mark.seq までの自分のアクションを確かめ終える。ack なら、その番号のアクションに常駐の答え said を返す（ほかは行えた）
  const settle = (mark: { client?: string; seq?: number }, said?: HostAnswer) => {
    if (mark.client !== client || mark.seq === undefined) return
    const upTo = mark.seq
    for (const p of pending) if (p.seq <= upTo) p.answer(p.seq === upTo && said ? said : { ok: true })
    pending = pending.filter(p => p.seq > upTo)
  }
  // 送り直しても届かなかったアクションバルクを外し、トーストで知らせる
  const drop = (p: Pending, why: string) => {
    logLine(`actions ${p.done.map(d => d.action).join(", ")} are not saved:`, why)
    pending = pending.filter(q => q !== p)
    p.answer({ ok: false, reason: "not-saved" })
    show()
    instance?.actions.showToast({ kind: "warn", message: "An edit could not be saved" })
  }
  const later = (ms: number) => {
    retry?.()
    retry = net.later(() => {
      retry = null
      void pump()
    }, ms)
  }
  // まだ送り届けていないアクションを、今のつながりで 1 つずつ順に送る
  const pump = async () => {
    if (sending) return
    sending = true
    try {
      for (;;) {
        const next = pending.find(p => p.sentTo !== link)
        if (!online || !next) return
        const to = client
        const via = link
        const res = await net
          .fetch("api/perform", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actions: next.done, client: to, seq: next.seq, key: next.key }),
          })
          .catch(() => null)
        if (!pending.includes(next)) continue // 送っている間に確かめ終わった
        // 送れなかった: つなぎ直したら送り直す（つながったままなら、しばらくして送り直す）
        if (!res) {
          later(RETRY_MS)
          return
        }
        if (res.ok) {
          next.sentTo = via // 送っている間につなぎ直したなら、前のつながりの答えは届かないので、新しいつながりで送り直す
          continue
        }
        next.tries += 1
        if (res.status < 500 || next.tries >= MAX_TRIES) {
          drop(next, `${res.status}`)
          continue
        }
        later(RETRY_MS)
        return
      }
    } finally {
      sending = false
    }
  }
  // 読んでいる間に届いた知らせ（読むごとに 1 つ）: ids は知らせで変わった・消えたページとフォルダの id、
  // replays は版を比べずに当てる物（設定・アノテーション・レコード・番号）を当てる処理で、読んだ世界の上に届いた順に当て直す
  interface During {
    ids: Set<string>
    replays: (() => void)[]
  }
  const reading = new Set<During>()
  const changed = (id: string) => {
    for (const d of reading) d.ids.add(id)
  }
  // 版を比べずに当てる物の知らせを今当て、読んでいる間なら、読み終えたときにも当て直す
  const noticed = (apply: () => void) => {
    apply()
    for (const d of reading) d.replays.push(apply)
  }
  const read = async () => {
    const during: During = { ids: new Set(), replays: [] }
    reading.add(during)
    try {
      const res = await net.fetch("api/data").catch(() => null)
      if (!res || res.status === 404) throw new NoServer()
      if (!res.ok) fail("E401", { status: `${res.status}` })
      take(DataSchema.parse(await res.json()), during)
    } finally {
      reading.delete(during)
    }
  }
  // 読んだ世界を入れる。読んでいる間に届いた知らせの方が新しければ、そちらを残す
  const take = (data: z.infer<typeof DataSchema>, { ids: during, replays }: During) => {
    const takeRows = (what: string, rows: Rows, read: readonly { id: string; row: unknown; version: number }[]) => {
      const have = new Set(read.map(r => r.id))
      for (const id of [...rows.keys()])
        if (!have.has(id) && !during.has(id)) {
          rows.delete(id)
          logLine(`removed ${what} ${id}; the server does not have it`)
        }
      for (const r of read) {
        const now = rows.get(r.id)
        if (during.has(r.id) && !now) continue
        if (now && now.version < r.version)
          logLine(`took ${what} ${r.id} v${r.version}; the window had v${now.version}`)
        if (!now || now.version < r.version) rows.set(r.id, { row: r.row, version: r.version })
        else if (now.version > r.version) logLine(`kept ${what} ${r.id} v${now.version}; the server has v${r.version}`)
      }
    }
    takeRows(
      "page",
      confirmed.pages,
      data.pages.map(p => ({ id: p.id, row: p.page, version: p.version })),
    )
    takeRows(
      "folder",
      confirmed.folders,
      data.folders.map(f => ({ id: f.id, row: f.folder, version: f.version })),
    )
    settings = data.settings ?? undefined
    annotations = data.annotations ?? {}
    records = data.records ?? {}
    counters = data.counters ?? {}
    for (const replay of replays) replay()
    plugins = data.plugins ?? []
    // 読んでいる間に届いた知らせの方が新しければ、そちらを残す
    for (const [id, at] of Object.entries(data.touched ?? {}))
      if ((touched[id] ?? "") < at) touched = { ...touched, [id]: at }
    for (const [id, at] of Object.entries(data.participantCalls ?? {}))
      if ((participantCalls[id] ?? "") < at) participantCalls = { ...participantCalls, [id]: at }
    for (const id of data.participantReady ?? [])
      if (!participantReady.includes(id)) participantReady = [...participantReady, id]
    // 参加者の様子は、読んだ物で全部を入れ替える
    participantLive = {}
    for (const [id, live] of Object.entries(data.participantLive ?? {})) {
      const l = liveOf(live)
      if (l) participantLive[id] = l
    }
  }
  // つなぎ直したときに読み直し、読み直した世界の上に、まだ確かめられていないアクションを出して送り直す。
  // 読めなければ送り直しは先に済ませ、同じつながりのうちは少し待って読み直す（読めるまで、知らせで変わった物のほかは古いまま）
  const reread = (at: number) => {
    void read().then(
      () => {
        show()
        void pump()
      },
      e => {
        logLine("could not read the server again:", e)
        show()
        void pump()
        if (at === link) net.later(() => at === link && reread(at), RETRY_MS)
      },
    )
  }

  // つながりが切れた。長く切れたままなら、切れていると見せる
  const lost = (why: string) => {
    const was = online
    online = false
    if (was) logLine(why)
    offlineTimer ??= net.later(() => instance?.setOffline(true), OFFLINE_MS)
  }
  let quietTimer: (() => void) | null = null // 黙って切れたとみるまでの待ち（取り消す関数。見張っていなければ null）
  let heardAt = 0 // 最後に知らせが届いた（つなぎ直し始めた）壁時計の時刻
  // 黙って切れたとみて、閉じてつなぎ直す（つながると hello が来る）
  const reconnect = (source: Events, why: string) => {
    if (events !== source) return
    quietTimer?.()
    quietTimer = null
    lost(why)
    source.close()
    attach(net.events("api/events"), null)
  }
  // 知らせが届くたびに待ち直す。QUIET_MS 何も届かなければ、つなぎ直す
  const heard = (source: Events) => {
    heardAt = net.now()
    quietTimer?.()
    quietTimer = net.later(() => reconnect(source, `no event for ${QUIET_MS / 1000}s; connecting again`), QUIET_MS)
  }
  // 見張っている間に、壁時計で QUIET_MS 何も届いていなければ、待ちを待たずにつなぎ直す（スリープ明けにフォーカスされたとき）
  const checkQuiet = () => {
    if (quietTimer && events && net.now() - heardAt >= QUIET_MS)
      reconnect(events, `no event for ${Math.round((net.now() - heardAt) / 1000)}s by the clock; connecting again`)
  }
  // 知らせを受ける処理を source に付ける。first はつながって最初の hello を待つ間だけの約束（hello で果たし、つながらなければ NoServer で断る）
  const attach = (source: Events, first: { resolve: () => void; reject: (e: unknown) => void } | null) => {
    events = source
    const on = (name: string, listener: (data: string) => void) =>
      source.on(name, data => {
        if (events !== source) return
        heard(source)
        // 形の合わない知らせは、そのまま捨てる（例外を外に出さない）
        try {
          listener(data)
        } catch (e) {
          logLine(`ignored a malformed ${name} notice: ${e instanceof Error ? e.message : String(e)}`)
        }
      })
    if (!first) heard(source)
    source.onError(() => {
      if (events !== source) return
      if (first) {
        source.close()
        const rejected = first.reject
        // 知らせが断られたのは、常駐が止まっているからか、このブラウザを知らないからか
        void net
          .fetch("api/data")
          .then(async res =>
            res.status === 403 && (await res.text()).trim() === "cookie-required"
              ? matomezuError(problem("E402"))
              : new NoServer(),
          )
          .catch(() => new NoServer())
          .then(rejected)
        return
      }
      // つなぎ直しはブラウザに任せる（つながると hello が来る）
      lost("lost the connection to the server")
    })
    on("hello", data => {
      const was = client
      client = HelloSchema.parse(JSON.parse(data)).client
      link += 1
      online = true
      if (first) {
        first.resolve()
        first = null
        return
      }
      // つなぎ直した: 読み直した世界の上に、まだ確かめられていないアクションを出し、新しいつながりで全部送り直す（送ったものの答えは前のつながりに届くので）。
      // warning と見ているものは新しいつながりで知らせ直す
      offlineTimer?.()
      offlineTimer = null
      instance?.setOffline(false)
      logLine(`reconnected as ${client} (was ${was}): sending ${pending.length} actions again`)
      tellWarnings()
      tellLog()
      void tellAIEditTickets()
      retell?.()
      reread(link)
    })
    on("changed", data => {
      const e = ChangedSchema.parse(JSON.parse(data))
      const put = (
        what: string,
        rows: Rows,
        id: string,
        row: unknown,
        version: number | undefined,
        removed: boolean,
      ) => {
        const have = rows.get(id)
        if (removed) rows.delete(id)
        else if (version !== undefined && (!have || have.version < version)) rows.set(id, { row, version })
        else if (have && version !== undefined && have.version > version)
          logLine(`kept ${what} ${id} v${have.version}; the notice had v${version}`)
        changed(id)
      }
      for (const p of e.pages) put("page", confirmed.pages, p.id, p.page, p.version, p.removed === true)
      for (const f of e.folders) put("folder", confirmed.folders, f.id, f.folder, f.version, f.removed === true)
      noticed(() => {
        if (e.settings !== undefined) settings = e.settings
        for (const [page, list] of Object.entries(e.annotations ?? {})) annotations = withPageAnnotations(page, list)
        if (e.records && e.records.length > 0) records = withRecords(restoreRecords(records), e.records)
        if (e.counters) counters = withCounters(restoreCounters(counters), e.counters)
      })
      // レコードが変わったときだけ、最後にフォーカスされた窓を受ける（郵便が届いたことを、その窓がマーキーで知らせる）
      if (e.records && e.records.length > 0 && e.window !== undefined) instance?.setLastWindow(e.window === client)
      settle(e)
      const act = e.act
      const foreign = e.client !== client && e.by !== undefined && act !== undefined
      show(
        foreign
          ? {
              books: e.books,
              by: e.by as "ai" | "window" | "host",
              act,
              actions: e.actions ?? [],
              ...(e.library ? { library: e.library } : {}),
            }
          : undefined,
      )
    })
    on("annotations", data => {
      const e = AnnotationsSchema.parse(JSON.parse(data))
      noticed(() => {
        annotations = withPageAnnotations(e.page, e.annotations)
      })
      show()
    })
    on("show", data => {
      if (instance) showIn(instance, ShowSchema.parse(JSON.parse(data)))
    })
    on("participant-calls", data => {
      const e = ParticipantCallSchema.parse(JSON.parse(data))
      if ((participantCalls[e.participant] ?? "") >= e.at) return
      participantCalls = { ...participantCalls, [e.participant]: e.at }
      show()
    })
    on("participant-ready", data => {
      const e = ParticipantReadySchema.parse(JSON.parse(data))
      if (participantReady.includes(e.participant)) return
      participantReady = [...participantReady, e.participant]
      show()
    })
    on("participant-live", data => {
      const e = ParticipantLiveSchema.parse(JSON.parse(data))
      const { [e.participant]: _, ...rest } = participantLive
      const l = liveOf(e)
      participantLive = l ? { ...rest, [e.participant]: l } : rest
      show()
    })
    on("touched", data => {
      const e = TouchedSchema.parse(JSON.parse(data))
      if ((touched[e.book] ?? "") >= e.at) return
      touched = { ...touched, [e.book]: e.at }
      show()
    })
    on("keep", () => {}) // 待ちを始め直すためだけに受ける
    // 機能台帳が変わった: 読めない物のフォルダへ移った・戻った物があれば、読み直したあとの窓に運ぶ（この窓が設定で無効にして移した物は、確かめたので運ばない）
    on("plugins", data => {
      const told = PluginsSchema.parse(JSON.parse(data))
      const moved = told.by === client ? [] : (told.moved ?? [])
      const returned = told.returned ?? 0
      net.reload(moved.length > 0 || returned > 0 ? JSON.stringify({ moved, returned }) : undefined)
    })
    on("ack", data => {
      const ack = AckSchema.parse(JSON.parse(data))
      settle({ client, seq: ack.seq }, ack.ok ? { ok: true } : { ok: false, reason: ack.reason })
      show()
    })
  }
  // 知らせのつながりを閉じ、見張りを止める
  const closeEvents = () => {
    quietTimer?.()
    quietTimer = null
    offlineTimer?.()
    offlineTimer = null
    events?.close()
  }
  // 知らせにつなぎ、最初の hello を待つ。つながらなければ NoServer
  const listen = () => new Promise<void>((resolve, reject) => attach(net.events("api/events"), { resolve, reject }))

  return {
    load: async (): Promise<Loaded> => {
      const notice = noticeOf(net.carried())
      await listen()
      // 知らせにはつながったが読めなかったら、つながりを閉じる（読み直すときは新しく作る）
      await read().catch(e => {
        closeEvents()
        throw e
      })
      // 1 つが読み込めなくても、ほかのプラグインとブックは読み、読み込めなかった物は理由と一緒に返す（読み込めた物だけ CSS も足す。画面の入口は、それが在れば起動を止める）
      const settled = await Promise.allSettled(
        plugins.map(async p => {
          const ui: unknown = (await net.importModule(p.ui)).default
          // default で、manifest と同じ id のプラグインを出していなければ、読み込めなかった物にする（ホストのエンジンと同じ確かめ）
          if (typeof ui !== "object" || ui === null || (ui as { id?: unknown }).id !== p.id)
            fail("E316", { plugin: p.id })
          if (p.css) net.addStyle(p.css)
          return ui
        }),
      )
      const added: unknown[] = []
      const failed: { id: string; error: unknown }[] = []
      plugins.forEach((p, i) => {
        const r = settled[i]
        if (r?.status === "fulfilled") added.push(r.value)
        else failed.push({ id: p.id, error: r?.reason })
      })
      return {
        // 残しておいたブック（ページとフォルダから組んだ物。形は store が確かめる）
        books: rawBooksOf(
          [...confirmed.pages.values()].map(e => e.row),
          [...confirmed.folders.values()].map(e => e.row),
        ),
        settings,
        plugins: added,
        failed,
        disabled: plugins.filter(p => p.disabled).map(p => p.id),
        ...(notice ? { unreadableNotice: notice } : {}),
      }
    },
    observe: done =>
      new Promise<HostAnswer>(answer => {
        seq += 1
        pending.push({ seq, key: net.newKey(), done, sentTo: 0, tries: 0, answer })
        void pump()
      }),
    reportWarnings: list => {
      warnings = list
      tellWarnings()
    },
    closeEvents: () => closeEvents(),
    removeScreenPlugins: async ids => {
      const res = await net
        .fetch("api/screen-plugins/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        })
        .catch(() => null)
      if (!res) return { state: "unreachable" }
      if (!res.ok) fail("E405", { status: `${res.status}` })
      const answer = SCREEN_PLUGINS_REMOVED.parse(await res.json())
      if (!answer.ok) return { state: "refused", id: answer.id, reason: answer.reason }
      net.reload()
      return { state: "removed" }
    },
    purgeUnreadable: async id => {
      const res = await net
        .fetch("api/unreadable/purge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        })
        .catch(() => null)
      if (!res?.ok) fail("E407", { id, status: res ? `${res.status}` : "no answer" })
      return PURGE_ANSWER.parse(await res.json()).ok ? PURGED : NOT_INSIDE
    },
    movedIfOff: async ids => {
      const res = await net
        .fetch("api/unreadable/if-off", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        })
        .catch(() => null)
      if (!res?.ok) fail("E408", { status: res ? `${res.status}` : "no answer" })
      const answer = MOVED_IF_OFF_ANSWER.parse(await res.json())
      return answer.ok ? answer.moved.map(({ type, ...m }) => (type === undefined ? m : { ...m, type })) : BROKEN
    },
    visible: () => net.visible(),
    search: async q => {
      const res = await net.fetch(`api/search?${wideSearchParams(q)}`)
      if (!res.ok) fail("E403", { status: `${res.status}` })
      return WIDE_SEARCH_ANSWER.parse(await res.json())
    },
    reportAIEditTicket: change => {
      aiEditTickets = [...aiEditTickets, change]
      void tellAIEditTickets()
    },
    connect: next => {
      instance = next
      show()
      let told = ""
      let viewSeq = 0 // 知らせの番号（届く順が入れ替わっても、常駐が古い方を捨てられるように増やす）
      // 見ているものと、利用者が直している物（どちらかが変わったときと、フォーカスされたときに知らせる）
      const tell = (focused: boolean) => {
        const state = next.state.getState()
        const now = JSON.stringify({
          view: viewOf(next.catalog.core, state),
          editLocks: editLocksOf(state),
          recordLocks: recordLocksOf(state),
        })
        if (now === told && !focused) return
        told = now
        viewSeq += 1
        void net
          .fetch("api/view", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client, ...JSON.parse(now), focused, seq: viewSeq }),
          })
          .catch(() => {})
      }
      tell(net.focused())
      retell = () => {
        told = ""
        tell(net.focused())
      }
      const stopView = next.state.subscribe(() => tell(false))
      const stopFocus = net.onFocus(() => {
        checkQuiet()
        tell(true)
      })
      // 裏のタブから前に出たら、まだ見ていない変更が見えたかを確かめ直す
      const stopVisible = net.onVisible(() => next.checkSeen())
      return () => {
        stopView()
        stopFocus()
        stopVisible()
        instance = null
        retell = null
        closeEvents()
      }
    },
  }
}

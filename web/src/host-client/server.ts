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

import type { z } from "zod"
import { fail, matomezuError, problem } from "../core/errors"
import { BROKEN } from "../core/folders"
import { restoreCounters, restoreRecords, withCounters, withRecords } from "../core/records"
import { NOT_INSIDE, PURGED, type UnreadableNotice } from "../core/unreadable"
import type { Warning } from "../core/warnings"
import type {
  Build,
  ForeignChange,
  HostPeers,
  HostRequest,
  HostStatus,
  MatomezuInstance,
  ParticipantLive,
  PendingMessage,
  UpdateStatus,
} from "../store/state"
import type { HostClient, Loaded } from "./client"
import { createLinkWatch } from "./link-watch"
import { WIDE_SEARCH_ANSWER, wideSearchParams } from "./search"
import { createSendQueue, RETRY_MS } from "./send-queue"
import {
  AckSchema,
  AnnotationsSchema,
  ASK_UPDATE_ANSWER,
  ChangedSchema,
  DataSchema,
  HelloSchema,
  HostPeersSchema,
  HostStatusSchema,
  MESSAGE_ANSWER,
  MOVED_IF_OFF_ANSWER,
  NoticeSchema,
  ParticipantCallSchema,
  ParticipantLiveSchema,
  ParticipantReadySchema,
  PENDING_MESSAGES,
  PluginsSchema,
  PURGE_ANSWER,
  SCREEN_PLUGINS_REMOVED,
  ShowSchema,
  TouchedSchema,
  UpdateStatusSchema,
} from "./server-schemas"
import { editLocksOf, recordLocksOf, showIn, viewOf } from "./server-view"

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

// ほかのホストについての頼みごとの、常駐の口（internal/server/server.go）
const HOSTS_PATHS: Record<HostRequest["kind"], string> = {
  pair: "api/hosts/pair",
  "end-pairing": "api/hosts/pair/end",
  check: "api/hosts/check",
  discover: "api/hosts/discover",
  "repick-port": "api/hosts/port",
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

// 参加者の様子のうち、空でない物（モデルもブランチも無く、起こす知らせを渡せる matomezu watch もつながっていなければ undefined）
const liveOf = (v: {
  model?: string | undefined
  branch?: string | undefined
  wake?: "reaches" | undefined
}): ParticipantLive | undefined =>
  v.model || v.branch || v.wake
    ? {
        ...(v.model ? { model: v.model } : {}),
        ...(v.branch ? { branch: v.branch } : {}),
        ...(v.wake ? { wake: v.wake } : {}),
      }
    : undefined

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
  let pendingMessages: readonly PendingMessage[] | undefined // 承認待ちの AI 間メッセージ（知らされた物。つなぐときに入れる）
  let updateStatus: UpdateStatus | undefined // 新しい版の確かめの結果（読んだか知らされた物）
  let hostStatus: HostStatus | undefined // ホストどうしの入口の様子（読んだか知らされた物）
  let hostPeers: HostPeers | undefined // ほかのホストの様子（読んだか知らされた物）
  let participantReady: string[] = [] // 準備中でない参加者の id（増えるだけ）
  let participantLive: Record<string, ParticipantLive> = {} // 参加者の id → モデルとブランチ（どちらも無い参加者は持たない）
  let plugins: { id: string; ui: string; css?: string; disabled?: boolean }[] = []
  let client = ""
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
  let retell: (() => void) | null = null // 見ているものを知らせ直す（connect で作る。常駐は窓の見ているものをつながりごとに持つので、つなぎ直したら知らせ直す）
  let instance: MatomezuInstance | null = null
  let events: Events | null = null
  let build: Build | undefined // 最初につないだ常駐の版とデータの形（つなぎ直したときに比べる）
  let formStale = false // データの形が違う常駐につながった。読み込み直すまで、データを変える頼みを送らない
  const queue = createSendQueue({
    net,
    client: () => client,
    online: () => watch.online(),
    link: () => watch.link(),
    instance: () => instance,
    show: () => show(),
  })
  const { settle, pump, tellAIEditTickets, tellLog, logLine } = queue
  const watch = createLinkWatch({
    net,
    events: () => events,
    attachAgain: () => attach(net.events("api/events"), null),
    instance: () => instance,
    logLine,
  })
  const { lost, heard, checkQuiet } = watch

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
      queue.bulks(),
      change,
    )
  // ページ page のアノテーションを list にした、ページごとのアノテーション（空の並びなら、そのページを持たない）
  const withPageAnnotations = (page: string, list: unknown) => {
    const { [page]: _, ...rest } = annotations
    return Array.isArray(list) && list.length === 0 ? rest : { ...rest, [page]: list }
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
    if (data.update) {
      updateStatus = data.update
      instance?.setUpdateStatus(data.update)
    }
    if (data.host) {
      hostStatus = data.host
      instance?.setHostStatus(data.host)
    }
    if (data.hostPeers) {
      hostPeers = data.hostPeers
      instance?.setHostPeers(data.hostPeers)
    }
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
        if (at === watch.link()) net.later(() => at === watch.link() && reread(at), RETRY_MS)
      },
    )
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
      const hello = HelloSchema.parse(JSON.parse(data))
      client = hello.client
      watch.opened()
      // 承認待ちは常駐がつないだ直後に、あるときだけ送り直す。持っている物は捨てる（常駐を起動し直したら、前の承認待ちは消えている）
      if (pendingMessages?.length) {
        pendingMessages = []
        instance?.setPendingMessages(pendingMessages)
      }
      if (first) {
        build = hello.build
        first.resolve()
        first = null
        return
      }
      // 常駐が別の版に替わったか、配る画面が変わった（画面の印は両方にあるときだけ比べる）: 読み込み直すよう促す。
      // データの形も違えば、まだ確かめられていないアクションを送らずに捨て、知らせも聞かない（古い画面で新しい形を読まない）
      const now = hello.build
      const webChanged = build?.web !== undefined && now?.web !== undefined && build.web !== now.web
      if (build && now && (build.version !== now.version || build.dataVersion !== now.dataVersion || webChanged)) {
        const formChanged = build.dataVersion !== now.dataVersion
        const dropped = formChanged ? queue.discard() : 0
        logLine(
          `the server is now ${now.version} (data ${now.dataVersion}, web ${now.web ?? "-"}); this window has ${build.version} (data ${build.dataVersion}, web ${build.web ?? "-"})`,
        )
        instance?.setStaleBuild({ from: build, to: now, dropped })
        if (formChanged) {
          formStale = true
          closeEvents()
          show()
          return
        }
      }
      // つなぎ直した: 読み直した世界の上に、まだ確かめられていないアクションを出し、新しいつながりで全部送り直す（送ったものの答えは前のつながりに届くので）。
      // warning と見ているものは新しいつながりで知らせ直す
      watch.recovered()
      logLine(`reconnected as ${client} (was ${was}): sending ${queue.count()} actions again`)
      tellWarnings()
      tellLog()
      void tellAIEditTickets()
      retell?.()
      reread(watch.link())
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
              by: e.by as "ai" | "window" | "host",
              act,
              actions: e.actions ?? [],
              ...(e.library ? { library: e.library } : {}),
            }
          : undefined,
      )
    })
    on("update-status", data => {
      updateStatus = UpdateStatusSchema.parse(JSON.parse(data))
      instance?.setUpdateStatus(updateStatus)
    })
    on("host-status", data => {
      hostStatus = HostStatusSchema.parse(JSON.parse(data))
      instance?.setHostStatus(hostStatus)
    })
    on("pending-messages", data => {
      pendingMessages = PENDING_MESSAGES.parse(JSON.parse(data))
      instance?.setPendingMessages(pendingMessages)
    })
    on("host-peers", data => {
      hostPeers = HostPeersSchema.parse(JSON.parse(data))
      instance?.setHostPeers(hostPeers)
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
  // データを変える頼み（アクションのほか）を送る。formStale の間は送らずに、届かなかったのと同じに返す
  const sendWrite = (path: string, body: unknown) =>
    formStale
      ? Promise.resolve(null)
      : net
          .fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
          .catch(() => null)
  // 知らせのつながりを閉じ、見張りを止める
  const closeEvents = () => {
    watch.stop()
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
        // 残しておいたページとフォルダの行（形は store が確かめる）
        saved: {
          pages: [...confirmed.pages.values()].map(e => e.row),
          folders: [...confirmed.folders.values()].map(e => e.row),
        },
        settings,
        plugins: added,
        failed,
        disabled: plugins.filter(p => p.disabled).map(p => p.id),
        ...(notice ? { unreadableNotice: notice } : {}),
      }
    },
    observe: done => queue.add(done),
    reportWarnings: list => {
      warnings = list
      tellWarnings()
    },
    closeEvents: () => closeEvents(),
    removeScreenPlugins: async ids => {
      const res = await sendWrite("api/screen-plugins/remove", { ids })
      if (!res) return { state: "unreachable" }
      if (!res.ok) fail("E405", { status: `${res.status}` })
      const answer = SCREEN_PLUGINS_REMOVED.parse(await res.json())
      if (!answer.ok) return { state: "refused", id: answer.id, reason: answer.reason }
      net.reload()
      return { state: "removed" }
    },
    checkUpdate: async () => {
      const res = await net
        .fetch("api/update/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
        .catch(() => null)
      if (!res?.ok) fail("E410", { status: res ? `${res.status}` : "no answer" })
      updateStatus = UpdateStatusSchema.parse(await res.json())
      instance?.setUpdateStatus(updateStatus)
    },
    askUpdate: async workroom => {
      const res = await net
        .fetch("api/update/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workroom }),
        })
        .catch(() => null)
      if (!res?.ok) fail("E411", { workroom, status: res ? `${res.status}` : "no answer" })
      return ASK_UPDATE_ANSWER.parse(await res.json()).ok
    },
    askHosts: async request => {
      const { kind, ...body } = request
      const res = await net
        .fetch(HOSTS_PATHS[kind], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        .catch(() => null)
      if (!res?.ok) fail("E413", { request: kind, status: res ? `${res.status}` : "no answer" })
    },
    answerMessage: async (id, answer) => {
      const res = await net
        .fetch(`api/message/${answer}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        })
        .catch(() => null)
      if (!res?.ok) fail("E415", { id, answer, status: res ? `${res.status}` : "no answer" })
      MESSAGE_ANSWER.parse(await res.json())
    },
    purgeUnreadable: async id => {
      const res = await sendWrite("api/unreadable/purge", { id })
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
    reportAIEditTicket: change => queue.reportAIEditTicket(change),
    connect: next => {
      instance = next
      show()
      if (updateStatus) next.setUpdateStatus(updateStatus)
      if (hostStatus) next.setHostStatus(hostStatus)
      if (hostPeers) next.setHostPeers(hostPeers)
      if (pendingMessages) next.setPendingMessages(pendingMessages)
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

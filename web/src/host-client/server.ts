// ホストに頼むホストクライアント: 画面は自分で先にアクションを行い、同じアクションを常駐に送る（POST /api/perform）。
// 常駐はアクションを 1 つずつ順に行い、変わったブックと設定をつながっている全部の画面に知らせる（/api/events。internal/server/hub.go）。
// 画面は、常駐が決めた世界（確かめた世界）の上で、まだ確かめられていない自分のアクションを行い直したものを出す（store の receive）。
// 自分のアクションは、その番号（seq）が知らせに返ってきたら確かめ終わり。断られたものは行い直さないので、画面から消える。
// 窓が見ているもの（ステージごとのブックとページ、カレントのステージの選択）と、窓がフォーカスされたことも知らせる（AI が「今の画面」を知るため）。
// 常駐から「ブックを出して」（show）と届いたら、言われたステージ（分けるなら、分けてできたステージ）でそのブックを開く。
// 常駐が足した追加プラグインは、読むときに見た目の JS を import() して、default で出したものを渡す（CSS も読む）。
// 追加プラグインが変わったと届いたら（plugins）、画面を読み直す（組み立て直すため）
import { z } from "zod"
import { fail } from "../core/errors"
import type { Stage } from "../core/stage"
import { currentStage, MAX_STAGES } from "../core/workspace"
import type { DoneAction, MatomezuInstance, MatomezuState } from "../store/store"
import type { HostClient, Loaded } from "./client"

// 常駐が答えなかった（常駐から開いていない）
export class NoServer {}

// 外とのやり取り（テストでは差し替える）
export interface Net {
  fetch(url: string, init?: RequestInit): Promise<Response>
  events(url: string): Events
  focused(): boolean // 窓がフォーカスされているか
  onFocus(listener: () => void): () => void // 窓がフォーカスされたら呼ぶ。止める関数を返す
  importModule(url: string): Promise<{ default?: unknown }> // ES モジュールを読む
  addStyle(url: string): void // CSS を読む
  reload(): void // 画面を読み直す
}
export interface Events {
  on(name: string, listener: (data: string) => void): void
  onError(listener: () => void): void
  close(): void
}

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
  importModule: url => import(new URL(url, document.baseURI).href),
  addStyle: url => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = url
    document.head.append(link)
  },
  reload: () => window.location.reload(),
}

const openedOf = (stage: Stage) => {
  const opened = stage.opened
  return { book: opened?.book ?? null, page: opened && "page" in opened ? (opened.page ?? null) : null }
}

// 窓が見ているもの。book・page・selection はカレントのステージのもの（何も開いていなければ book は null）
export function viewOf(state: MatomezuState) {
  const ws = state.workspace
  const stage = currentStage(ws)
  return {
    ...openedOf(stage),
    selection: stage.selection,
    stage: stage.id,
    stages: ws.stages.map(s => ({ id: s.id, ...openedOf(s) })),
    canSplit: ws.stages.length < MAX_STAGES,
  }
}

const ShowSchema = z.object({
  book: z.string(),
  page: z.string().optional(),
  stage: z.string().optional(),
  split: z.boolean().optional(),
})

// 常駐が頼んだブックを出す。ステージが無ければカレント、split なら分けて右にできたステージに出す
export function showIn(instance: MatomezuInstance, show: z.infer<typeof ShowSchema>) {
  const { actions, state } = instance
  let stage = show.stage ?? state.getState().workspace.current
  if (show.split) {
    const before = state.getState().workspace.stages.map(s => s.id)
    actions.split(stage)
    const added = state.getState().workspace.stages.find(s => !before.includes(s.id))
    if (!added) return
    stage = added.id
  }
  actions.openBook(stage, show.book)
  if (show.page) actions.openPage(stage, show.page)
}

const DataSchema = z.object({
  books: z.array(z.object({ id: z.string(), book: z.unknown(), version: z.number().int() })),
  settings: z.unknown(),
  plugins: z.array(z.object({ id: z.string(), ui: z.string(), css: z.string().optional() })).optional(),
})
const HelloSchema = z.object({ client: z.string() })
const Mark = { client: z.string().optional(), seq: z.number().int().optional() }
const BookSchema = z.object({ book: z.object({ id: z.string() }).loose(), version: z.number().int(), ...Mark })
const SettingsSchema = z.object({ settings: z.unknown(), ...Mark })
const AckSchema = z.object({ seq: z.number().int() })

export interface ServerClient extends HostClient {
  pending(): readonly DoneAction[] // まだ確かめられていない自分のアクション
}

export function serverClient(net: Net = browserNet): ServerClient {
  const confirmed = new Map<string, { book: unknown; version: number }>()
  let settings: unknown
  let plugins: { id: string; ui: string; css?: string }[] = []
  let pending: { seq: number; done: DoneAction }[] = []
  let client = ""
  let seq = 0
  let instance: MatomezuInstance | null = null
  let events: Events | null = null

  const show = () =>
    instance?.actions.receive(
      { books: [...confirmed.values()].map(e => e.book), settings },
      pending.map(p => p.done),
    )
  const settle = (mark: { client?: string; seq?: number }) => {
    if (mark.client === client && mark.seq !== undefined) pending = pending.filter(p => p.seq > (mark.seq as number))
  }
  const read = async () => {
    const res = await net.fetch("api/data").catch(() => null)
    if (!res || res.status === 404) throw new NoServer()
    if (!res.ok) fail("E401", { status: `${res.status}` })
    const data = DataSchema.parse(await res.json())
    // 読んでいる間に届いた知らせの方が新しければ、そちらを残す
    for (const b of data.books) {
      const have = confirmed.get(b.id)
      if (!have || have.version < b.version) confirmed.set(b.id, { book: b.book, version: b.version })
    }
    settings = data.settings ?? undefined
    plugins = data.plugins ?? []
  }

  // 知らせにつなぎ、最初の hello を待つ。つながらなければ NoServer
  const listen = () =>
    new Promise<void>((resolve, reject) => {
      const source = net.events("api/events")
      events = source
      let first = true
      source.onError(() => {
        if (!first) return // つなぎ直しはブラウザに任せる（つながると hello が来る）
        source.close()
        reject(new NoServer())
      })
      source.on("hello", data => {
        client = HelloSchema.parse(JSON.parse(data)).client
        if (first) {
          first = false
          resolve()
          return
        }
        // つなぎ直した: 前のつながりで送ったアクションの答えは届かないので、読み直した世界から出し直す
        pending = []
        void read().then(show, () => {})
      })
      source.on("book", data => {
        const e = BookSchema.parse(JSON.parse(data))
        const have = confirmed.get(e.book.id)
        if (!have || have.version < e.version) confirmed.set(e.book.id, { book: e.book, version: e.version })
        settle(e)
        show()
      })
      source.on("settings", data => {
        const e = SettingsSchema.parse(JSON.parse(data))
        settings = e.settings
        settle(e)
        show()
      })
      source.on("show", data => {
        if (instance) showIn(instance, ShowSchema.parse(JSON.parse(data)))
      })
      source.on("plugins", () => net.reload())
      source.on("ack", data => {
        settle({ client, seq: AckSchema.parse(JSON.parse(data)).seq })
        show()
      })
    })

  return {
    pending: () => pending.map(p => p.done),
    load: async (): Promise<Loaded> => {
      await listen()
      await read()
      // 1 つが読み込めなくても、ほかのプラグインとブックは読む（読み込めた物だけ CSS も足す）
      const settled = await Promise.allSettled(
        plugins.map(async p => {
          const ui = (await net.importModule(p.ui)).default
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
      return { books: [...confirmed.values()].map(e => e.book), settings, plugins: added, failed }
    },
    observe: done => {
      seq += 1
      pending.push({ seq, done })
      void net
        .fetch("api/perform", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...done, client, seq }),
        })
        .catch(() => {})
    },
    connect: next => {
      instance = next
      show()
      let told = ""
      let viewSeq = 0 // 知らせの番号（届く順が入れ替わっても、常駐が古い方を捨てられるように増やす）
      const tell = (focused: boolean) => {
        const view = JSON.stringify(viewOf(next.state.getState()))
        if (view === told && !focused) return
        told = view
        viewSeq += 1
        void net
          .fetch("api/view", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client, view: JSON.parse(view), focused, seq: viewSeq }),
          })
          .catch(() => {})
      }
      tell(net.focused())
      const stopView = next.state.subscribe(() => tell(false))
      const stopFocus = net.onFocus(() => tell(true))
      return () => {
        stopView()
        stopFocus()
        instance = null
        events?.close()
      }
    },
  }
}

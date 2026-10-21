// 常駐に頼むホスト: 画面は自分で先にアクションを行い、同じアクションを常駐に送る（POST /api/perform）。
// 常駐はアクションを 1 つずつ順に行い、変わったブックと設定をつながっている全部の画面に知らせる（/api/events。internal/server/hub.go）。
// 画面は、常駐が決めた世界（確かめた世界）の上で、まだ確かめられていない自分のアクションを行い直したものを出す（store の receive）。
// 自分のアクションは、その番号（seq）が知らせに返ってきたら確かめ終わり。断られたものは行い直さないので、画面から消える。
// カレントのステージが見ているもの（ブック・ページ・選択）と、窓がフォーカスされたことも知らせる（AI が「今の画面」を知るため）
import { z } from "zod"
import { fail } from "../core/errors"
import { currentStage } from "../core/workspace"
import type { AppState, AppStore, DoneAction } from "../store/store"
import type { Host, Loaded } from "./host"

// 常駐が答えなかった（常駐から開いていない）
export class NoServer {}

// 外とのやり取り（テストでは差し替える）
export interface Net {
  fetch(url: string, init?: RequestInit): Promise<Response>
  events(url: string): Events
  focused(): boolean // 窓がフォーカスされているか
  onFocus(listener: () => void): () => void // 窓がフォーカスされたら呼ぶ。止める関数を返す
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
}

// カレントのステージが見ているもの（何も開いていなければ null）
export function viewOf(state: AppState): { book: string; page: string | null; selection: readonly string[] } | null {
  const stage = currentStage(state.workspace)
  const opened = stage.opened
  if (!opened) return null
  return { book: opened.book, page: "page" in opened ? (opened.page ?? null) : null, selection: stage.selection }
}

const DataSchema = z.object({
  books: z.array(z.object({ id: z.string(), book: z.unknown(), version: z.number().int() })),
  settings: z.unknown(),
})
const HelloSchema = z.object({ client: z.string() })
const Mark = { client: z.string().optional(), seq: z.number().int().optional() }
const BookSchema = z.object({ book: z.object({ id: z.string() }).loose(), version: z.number().int(), ...Mark })
const SettingsSchema = z.object({ settings: z.unknown(), ...Mark })
const AckSchema = z.object({ seq: z.number().int() })

export interface ServerHost extends Host {
  pending(): readonly DoneAction[] // まだ確かめられていない自分のアクション
}

export function serverHost(net: Net = browserNet): ServerHost {
  const confirmed = new Map<string, { book: unknown; version: number }>()
  let settings: unknown
  let pending: { seq: number; done: DoneAction }[] = []
  let client = ""
  let seq = 0
  let app: AppStore | null = null
  let events: Events | null = null

  const show = () =>
    app?.actions.receive(
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
      return { books: [...confirmed.values()].map(e => e.book), settings }
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
      app = next
      show()
      let told = ""
      const tell = (focused: boolean) => {
        const view = JSON.stringify(viewOf(next.state.getState()))
        if (view === told && !focused) return
        told = view
        void net
          .fetch("api/view", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client, view: JSON.parse(view), focused }),
          })
          .catch(() => {})
      }
      tell(net.focused())
      const stopView = next.state.subscribe(() => tell(false))
      const stopFocus = net.onFocus(() => tell(true))
      return () => {
        stopView()
        stopFocus()
        app = null
        events?.close()
      }
    },
  }
}

// 常駐に頼むホスト: 画面は自分で先にアクションを行い、同じアクションを常駐に送る（POST /api/perform）。
// 常駐はアクションを 1 つずつ順に行い、変わったブックと設定をつながっている全部の画面に知らせる（/api/events。internal/server/hub.go）。
// 画面は、常駐が決めた世界（確かめた世界）の上で、まだ確かめられていない自分のアクションを行い直したものを出す（store の receive）。
// 自分のアクションは、その番号（seq）が知らせに返ってきたら確かめ終わり。断られたものは行い直さないので、画面から消える
import { z } from "zod"
import { fail } from "../core/errors"
import type { AppStore, DoneAction } from "../store/store"
import type { Host, Loaded } from "./host"

// 常駐が答えなかった（常駐から開いていない）
export class NoServer {}

// 外とのやり取り（テストでは差し替える）
export interface Net {
  fetch(url: string, init?: RequestInit): Promise<Response>
  events(url: string): Events
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
    confirmed.clear()
    for (const b of data.books) confirmed.set(b.id, { book: b.book, version: b.version })
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
      return () => {
        app = null
        events?.close()
      }
    },
  }
}

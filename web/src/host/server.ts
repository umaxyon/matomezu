// サーバーに頼むホスト: 常駐（matomezu serve）の API で読み、変わったブックと設定を少し待ってまとめて書く。
// ブックは読んだときの版を添えて書く。ほかから書き換えられていれば（409）、そのブックはそれから書かない。
// 窓を閉じる・読み直すときは、待っているものをすぐ送る（keepalive。窓が無くなっても届く）
import { z } from "zod"
import { fail } from "../core/errors"
import type { Book } from "../core/schema/book"
import type { Settings } from "../core/settings"
import type { Host, Loaded } from "./host"

// 書く前に待つ時間（続けて変わったものを 1 回にまとめる）
export const SAVE_DELAY = 300

const DataSchema = z.object({
  books: z.array(z.object({ id: z.string(), book: z.unknown(), version: z.number().int() })),
  settings: z.unknown(),
})
const SavedSchema = z.object({ version: z.number().int() })

export interface ServerHost extends Host {
  flush(): Promise<void> // 待っている書き込みを、すぐ書く（書き終わるまで待つ）
  stale: ReadonlySet<string> // ほかから書き換えられていたので、書かないブック
}

// 常駐が答えなかった（常駐から開いていない）
export class NoServer {}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export function serverHost(fetcher: Fetch = (url, init) => fetch(url, init)): ServerHost {
  const versions = new Map<string, number>() // ブックの、置いてある版（まだ置いていなければ無い）
  const waiting = new Map<string, Book>() // 書くのを待っているブック
  const stale = new Set<string>()
  let settings: Settings | null = null // 書くのを待っている設定
  let timer: ReturnType<typeof setTimeout> | null = null
  let writing: Promise<void> = Promise.resolve() // 書いている途中のもの（書くのは 1 回ずつ、順に）

  const put = (url: string, body: unknown, keepalive = false) =>
    fetcher(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive,
    })

  const writeBook = async (book: Book) => {
    const res = await put(`api/books/${encodeURIComponent(book.id)}`, { book, base: versions.get(book.id) ?? 0 })
    if (res.status === 409) {
      stale.add(book.id)
      return
    }
    if (!res.ok) return // 書けなければ、次に変わったときにまた書く
    versions.set(book.id, SavedSchema.parse(await res.json()).version)
  }

  // 待っているものを書く。書いている途中に来たものは、そのあとに書く
  const write = () => {
    if (timer) clearTimeout(timer)
    timer = null
    const books = [...waiting.values()]
    const next = settings
    waiting.clear()
    settings = null
    writing = writing.then(async () => {
      for (const book of books) await writeBook(book).catch(() => {})
      if (next) await put("api/settings", next).catch(() => {})
    })
    return writing
  }
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(write, SAVE_DELAY)
  }

  // 窓が無くなるときは待たずに送る（版は書いている途中のものが返す前の値になりうるが、届かないよりよい）
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => {
      for (const book of waiting.values()) {
        void put(`api/books/${encodeURIComponent(book.id)}`, { book, base: versions.get(book.id) ?? 0 }, true)
      }
      if (settings) void put("api/settings", settings, true)
      waiting.clear()
      settings = null
    })
  }

  return {
    stale,
    load: async (): Promise<Loaded> => {
      const res = await fetcher("api/data").catch(() => null)
      if (!res || res.status === 404) throw new NoServer()
      if (!res.ok) fail("E401", { status: `${res.status}` })
      const data = DataSchema.parse(await res.json())
      for (const b of data.books) versions.set(b.id, b.version)
      return { books: data.books.map(b => b.book), settings: data.settings ?? undefined }
    },
    saveBook: book => {
      if (stale.has(book.id)) return
      waiting.set(book.id, book)
      schedule()
    },
    saveSettings: next => {
      settings = next
      schedule()
    },
    flush: write,
  }
}

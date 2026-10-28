// メモリに持つホストクライアント（ホストがいないときの代わり）: 残したものは読み直すと消える。テストと、サーバーなしで開いたときに使う。
// アクションは画面の中で済み、変わったブックと設定をそのまま覚える（persist）。一覧から無くなったブックはゴミ箱に覚え、戻す・消すもここで済ませる
import type { Book } from "../core/schema/book"
import type { Settings } from "../core/settings"
import type { MatomezuInstance, TrashEntry } from "../store/store"
import type { HostClient } from "./client"
import { persist } from "./persist"

export interface MemoryClient extends HostClient {
  books: ReadonlyMap<string, Book> // 残したブック（最初に渡したものも）
  settings: Settings | undefined // 残した設定
}

export function memoryClient(books: readonly Book[] = [], settings?: Settings): MemoryClient {
  const kept = new Map(books.map(b => [b.id, b]))
  const trashed = new Map<string, { book: Book; at: string }>()
  let instance: MatomezuInstance | null = null
  // 覚えたブックとゴミ箱を、画面に入れ直す
  const show = () => {
    const trash: TrashEntry[] = [...trashed.values()]
      .map(({ book, at }) => ({ id: book.id, type: book.type, title: book.title, at }))
      .sort((a, b) => (a.at < b.at ? 1 : -1))
    instance?.receive({ books: [...kept.values()], settings: host.settings, trash }, [])
  }
  const host: MemoryClient = {
    books: kept,
    settings,
    load: async () => ({ books: [...kept.values()], settings: host.settings, plugins: [], failed: [] }),
    observe: () => {},
    reportWarnings: () => {}, // ホストがいないので、知らせる先が無い（warning は画面の中で見る）
    restore: book => {
      const found = trashed.get(book)
      if (!found) return
      trashed.delete(book)
      kept.set(book, found.book)
      show()
    },
    purge: ids => {
      for (const id of ids.length === 0 ? [...trashed.keys()] : ids) trashed.delete(id)
      show()
    },
    connect: next => {
      instance = next
      const stopPersist = persist(next, {
        saveBook: book => {
          kept.set(book.id, book)
        },
        saveSettings: value => {
          host.settings = value
        },
      })
      // 一覧から無くなったブックをゴミ箱へ
      const stopTrash = next.state.subscribe((state, prev) => {
        if (state.books === prev.books) return
        const gone = Object.values(prev.books).filter(b => !(b.id in state.books) && kept.has(b.id))
        if (gone.length === 0) return
        const at = new Date().toISOString()
        for (const b of gone) {
          kept.delete(b.id)
          trashed.set(b.id, { book: b, at })
        }
        show()
      })
      return () => {
        stopPersist()
        stopTrash()
        instance = null
      }
    },
  }
  return host
}

// メモリに持つホスト: 残したものは読み直すと消える。テストと、サーバーなしで開いたときに使う。
// アクションは画面の中で済み、変わったブックと設定をそのまま覚える（persist）
import type { Book } from "../core/schema/book"
import type { Settings } from "../core/settings"
import type { Host } from "./host"
import { persist } from "./persist"

export interface MemoryHost extends Host {
  books: ReadonlyMap<string, Book> // 残したブック（最初に渡したものも）
  settings: Settings | undefined // 残した設定
}

export function memoryHost(books: readonly Book[] = [], settings?: Settings): MemoryHost {
  const kept = new Map(books.map(b => [b.id, b]))
  const host: MemoryHost = {
    books: kept,
    settings,
    load: async () => ({ books: [...kept.values()], settings: host.settings }),
    observe: () => {},
    connect: app =>
      persist(app, {
        saveBook: book => {
          kept.set(book.id, book)
        },
        saveSettings: next => {
          host.settings = next
        },
      }),
  }
  return host
}

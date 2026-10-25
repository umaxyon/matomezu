// メモリに持つホストクライアント（ホストがいないときの代わり）: 残したものは読み直すと消える。テストと、サーバーなしで開いたときに使う。
// アクションは画面の中で済み、変わったブックと設定をそのまま覚える（persist）
import type { Book } from "../core/schema/book"
import type { Settings } from "../core/settings"
import type { HostClient } from "./client"
import { persist } from "./persist"

export interface MemoryClient extends HostClient {
  books: ReadonlyMap<string, Book> // 残したブック（最初に渡したものも）
  settings: Settings | undefined // 残した設定
}

export function memoryClient(books: readonly Book[] = [], settings?: Settings): MemoryClient {
  const kept = new Map(books.map(b => [b.id, b]))
  const host: MemoryClient = {
    books: kept,
    settings,
    load: async () => ({ books: [...kept.values()], settings: host.settings, plugins: [] }),
    observe: () => {},
    connect: instance =>
      persist(instance, {
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

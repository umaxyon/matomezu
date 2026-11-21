// メモリに持つホストクライアント（テストでホストの代わりに使う）: 残したものは読み直すと消える。
// アクションは画面の中で済み、変わったブック（ゴミ箱のブックも）と設定をそのまま覚え、ゴミ箱から消したブックは忘れる（persist）

import { recordContext } from "../../web/src/core/ai-list"
import type { Book } from "../../web/src/core/schema/book"
import type { Settings } from "../../web/src/core/settings"
import { NOT_INSIDE } from "../../web/src/core/unreadable"
import type { WideSearchAnswer, WideSearchHit, WideSearchQuery } from "../../web/src/core/wide-search"
import type { HostClient } from "../../web/src/host-client/client"
import type { MatomezuInstance } from "../../web/src/store/state"
import { worldRows } from "../support"
import { persist } from "./persist"

export interface MemoryClient extends HostClient {
  books: ReadonlyMap<string, Book> // 残したブック（最初に渡したものも）
  settings: Settings | undefined // 残した設定
}

// 横断検索のメモリ版: つながっているインスタンスのレコードから、searchTexts を書いた種類を部分一致（大文字小文字は区別しない）で探す。
// 並びはレコードの並び、載せない物の扱い（unlisted）は見ない（全部含める）
function searchIn(instance: MatomezuInstance | undefined, q: WideSearchQuery): WideSearchAnswer {
  if (!instance) return { total: 0, hits: [] }
  const core = instance.catalog.core
  const records = instance.state.getState().records
  const terms = q.terms.map(t => t.toLowerCase())
  const hits: WideSearchHit[] = []
  for (const [kind, table] of Object.entries(records)) {
    const def = core.subjects.get(kind)
    if (!def?.searchTexts || (q.kinds && !q.kinds.includes(kind))) continue
    for (const [id, record] of Object.entries(table)) {
      const parsed = record as never
      const texts = def.searchTexts(parsed)
      const found = (["title", "body"] as const).flatMap(part => {
        const text = texts[part] ?? ""
        const at = Math.min(...terms.map(t => text.toLowerCase().indexOf(t)).filter(i => i >= 0))
        return Number.isFinite(at) ? [{ part, snippet: text.slice(Math.max(0, at - 20), at + 40) }] : []
      })[0]
      if (!found) continue
      const parent = def.refers?.(parsed)[0]
      const parentDef = parent ? core.subjects.get(parent.subject) : undefined
      const parentRecord = parent ? records[parent.subject]?.[parent.id] : undefined
      const label =
        texts.title ||
        (parentDef?.searchTexts && parentRecord ? parentDef.searchTexts(parentRecord as never).title : undefined)
      hits.push({
        kind,
        id,
        part: found.part,
        brief:
          def.aiBrief?.(
            parsed,
            recordContext(core, def, parsed, (s, i) => records[s]?.[i]),
          ) ?? id,
        snippet: found.snippet,
        ...(label ? { label } : {}),
        ...(parent && core.subjects.get(parent.subject)?.searchTexts
          ? { of: { kind: parent.subject, id: parent.id } }
          : {}),
      })
    }
  }
  const from = q.offset ?? 0
  const limit = q.limit ?? 20
  const page = hits.slice(from, from + limit)
  const rest = hits.length - from - page.length
  return { total: hits.length, hits: page, ...(rest > 0 ? { more: rest, next: from + page.length } : {}) }
}

export function memoryClient(books: readonly Book[] = [], settings?: Settings): MemoryClient {
  const kept = new Map(books.map(b => [b.id, b]))
  let connected: MatomezuInstance | undefined
  const host: MemoryClient = {
    books: kept,
    settings,
    load: async () => ({
      saved: worldRows([...kept.values()]),
      settings: host.settings,
      plugins: [],
      failed: [],
      disabled: [],
    }),
    observe: async () => ({ ok: true }), // ホストがいないので、断る物もいない
    reportWarnings: () => {}, // ホストがいないので、知らせる先が無い（warning は画面の中で見る）
    reportAIEditTicket: () => {}, // ホストがいないので、AI もいない
    closeEvents: () => {}, // 知らせのつながりが無い
    removeScreenPlugins: async () => ({ state: "removed" }), // 追加プラグインを持たないので、外す物も無い
    purgeUnreadable: async () => NOT_INSIDE, // 読めない物のフォルダを持たないので、消す物も無い
    movedIfOff: async () => [], // 追加プラグインを持たないので、移る物も無い
    visible: () => true,
    search: async q => searchIn(connected, q),
    connect: instance => {
      connected = instance
      const stop = persist(instance, {
        saveBook: book => {
          kept.set(book.id, book)
        },
        removeBook: id => {
          kept.delete(id)
        },
        saveSettings: next => {
          host.settings = next
        },
      })
      return () => {
        connected = undefined
        stop()
      }
    },
  }
  return host
}

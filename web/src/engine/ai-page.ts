// AI に見せるページの計算（MCP 公開ツールの read_page・read_book）: 形の描いた位置と大きさ・背景を名前だけにしたページ・id で探した物。
// 台帳アセンブルの結果（Assembled）は、呼ぶたびに引数で受ける

import { readablePage, restoreBooks } from "../core/book"
import { slideIsBackground } from "../core/def/page-type"
import { findShape, type ItemPage, NO_ITEM, pageItemsOf, walkShapes } from "../core/placed"
import { aiPlacedOf, aiPlacedOfPage } from "../plugins/base"
import type { Assembled } from "../store/plugin"

// engine.ts の matomezuAiPlaced の中身
export function placedForAi(of: Assembled, book: string): string {
  const catalog = of.catalog.core
  const [read] = restoreBooks(catalog, [JSON.parse(book)])
  return JSON.stringify(read ? aiPlacedOf(catalog, read) : null)
}

// engine.ts の matomezuAiPagePlaced の中身
export function pagePlacedForAi(of: Assembled, page: string): string {
  const catalog = of.catalog.core
  const read = readablePage(catalog, JSON.parse(page), true)
  return JSON.stringify(read ? aiPlacedOfPage(catalog, read as ItemPage) : null)
}

// engine.ts の matomezuAiPage の中身
export function pageForAi(of: Assembled, page: string): string {
  const catalog = of.catalog.core
  const body = JSON.parse(page) as { type?: string; slide?: { id: string; item: string }[] }
  const type = typeof body.type === "string" ? catalog.pageTypes.get(body.type) : undefined
  if (!type || !Array.isArray(body.slide) || body.slide.length === 0 || !slideIsBackground(type)) return page
  if (!readablePage(catalog, body, true)) return page
  const { slide, ...rest } = body
  const texts = slide.flatMap(s => {
    const def = catalog.items.get(s.item)
    const text = def?.kind === "shape" ? def.labelOf?.(s as never, s.id) : undefined
    return text ? [text] : []
  })
  return JSON.stringify({ ...rest, background: { texts } })
}

// engine.ts の matomezuAiItem の中身
export function itemForAi(page: string, id: string): string {
  const body = JSON.parse(page) as ItemPage
  const found = findShape(body, id)
  const shape = found === NO_ITEM ? undefined : found.shape
  const item = shape ?? pageItemsOf(body).find(i => i.id === id)
  if (!item) return JSON.stringify(null)
  const ids = shape ? walkShapes({ ...body, items: [shape] }).map(s => s.shape.id) : [id]
  return JSON.stringify({ item, ids })
}

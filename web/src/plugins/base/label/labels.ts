// 物の名前（伝言の右サイドパネルのバッジや、鳥の名前に出す。画面に出す名前は anchor-name.tsx）: ブックの中の物 id の名前を、定義オブジェクトの labelOf（書き足すのは index.ts）から引く。
// 引く順は、ブックのタイプの labelOf（ページの中の物。ツリーの節など）→ 形の labelOf（形そのものか、その中の物。リストの行など）→
// 形そのものならキャプション（定義の captionProp の項目）→ つなぐものの labelOf → 物の種類の名前（文言の鍵）。本文の装飾は外す
import { pagedOf } from "../../../core/book"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import { connectorsOf, walkShapes } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { shapeDefOf } from "../place/placed"
import { parseRich, plainOf } from "../text/rich"

export type AnchorLabel = { text: string } | { title: string }

// 本文の書き方の名前から、装飾を外した 1 行（空白だけなら null）
function plain(text: string | null | undefined): { text: string } | null {
  if (typeof text !== "string") return null
  const line = parseRich(text).map(plainOf).join(" ").trim()
  return line === "" ? null : { text: line }
}

// ブック book の物 id の名前（ブックに無ければ null）
export function anchorLabel(catalog: CoreCatalog, book: Book | null, id: string): AnchorLabel | null {
  if (!book) return null
  const ofPage = bookType(catalog, book.type).labelOf
  for (const page of pagedOf(book)?.pages ?? []) {
    const own = ofPage?.(page, id)
    if (own != null) return plain(own) ?? { title: bookType(catalog, book.type).title }
    for (const { shape } of walkShapes(page)) {
      const def = shapeDefOf(catalog, shape.item)
      const named = def?.labelOf?.(shape, id) ?? null
      const title = { title: def?.title ?? shape.item }
      if (named !== null) return plain(named) ?? title
      if (shape.id !== id) continue
      const caption = def?.captionProp
        ? (shape.props as Record<string, unknown> | undefined)?.[def.captionProp]
        : undefined
      return plain(typeof caption === "string" ? caption : null) ?? title
    }
    const line = connectorsOf(page).find(c => c.id === id)
    if (line) {
      const def = catalog.items.get(line.item)
      const named = def?.kind === "connector" ? (def.labelOf?.(line) ?? null) : null
      return plain(named) ?? { title: def?.title ?? line.item }
    }
  }
  return null
}

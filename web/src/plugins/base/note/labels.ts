// 伝言の付ける先の名前（右サイドパネルのバッジに出す）: ブックの中の物 id の、形ならキャプション（定義の captionProp の項目）、無ければ物の種類の名前（文言の鍵）。
// ページの中の形でもつなぐものでもない物（リストの行など）は、それを持つアイテムの種類の名前
import { pagedOf } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import { connectorsOf, walkShapes } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { shapeDefOf } from "../place/placed"

export type AnchorLabel = { text: string } | { title: string }

// 値 value の中のどこかに、id が id の物があるか
const holds = (value: unknown, id: string): boolean =>
  Array.isArray(value)
    ? value.some(v => holds(v, id))
    : typeof value === "object" && value !== null
      ? Object.entries(value).some(([k, v]) => (k === "id" ? v === id : holds(v, id)))
      : false

// ブック book の物 id の名前（ブックに無ければ null）
export function anchorLabel(catalog: CoreCatalog, book: Book | null, id: string): AnchorLabel | null {
  for (const page of pagedOf(book)?.pages ?? []) {
    const shapes = walkShapes(page)
    const shape = shapes.find(s => s.shape.id === id)?.shape
    if (shape) {
      const prop = shapeDefOf(catalog, shape.item)?.captionProp
      const caption = prop ? (shape.props as Record<string, unknown> | undefined)?.[prop] : undefined
      if (typeof caption === "string" && caption.trim() !== "") return { text: caption }
      return { title: catalog.items.get(shape.item)?.title ?? shape.item }
    }
    const connector = connectorsOf(page).find(c => c.id === id)
    if (connector) return { title: catalog.items.get(connector.item)?.title ?? connector.item }
    const owner = [...shapes].reverse().find(({ shape: { shapes: _, ...own } }) => holds(own, id))?.shape
    if (owner) return { title: catalog.items.get(owner.item)?.title ?? owner.item }
  }
  return null
}

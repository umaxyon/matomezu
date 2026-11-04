// 物の名前（伝言の右サイドパネルのバッジや、鳥の名前に出す。画面に出す名前は anchor-name.tsx）: ブックの中の物 id の名前を、その id を持つ物の定義オブジェクトの labelOf（書き足すのは index.ts）から引く。
// id を持つ物は、id を中に持ついちばん内側の形（形そのものか、リストの行など形の中の物）→ つなぐもの → ページ（ツリーの節など。ブックのタイプが受ける）の順に探す。
// 形が labelOf を書かなければ、形そのものはキャプション（定義の captionProp の項目）。名前が空なら、id を持つ物の種類の名前（文言の鍵）。本文の装飾は外す
import { pagedOf } from "../../../core/book"
import { bookType, type CoreCatalog } from "../../../core/core-catalog"
import { idsIn } from "../../../core/ids"
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
  const type = bookType(catalog, book.type)
  for (const page of pagedOf(book)?.pages ?? []) {
    // 中の形は別に歩くので、形の中の物から外す
    const shape = walkShapes(page).find(({ shape }) => idsIn({ ...shape, shapes: undefined }).includes(id))?.shape
    if (shape) {
      const def = shapeDefOf(catalog, shape.item)
      const caption =
        shape.id === id && def?.captionProp
          ? (shape.props as Record<string, unknown> | undefined)?.[def.captionProp]
          : undefined
      const name = def?.labelOf ? def.labelOf(shape, id) : typeof caption === "string" ? caption : ""
      return plain(name) ?? { title: def?.title ?? shape.item }
    }
    const line = connectorsOf(page).find(c => c.id === id)
    if (line) {
      const def = catalog.items.get(line.item)
      return plain(def?.kind === "connector" ? def.labelOf?.(line) : null) ?? { title: def?.title ?? line.item }
    }
    if (idsIn(page).includes(id)) return plain(type.labelOf?.(page, id)) ?? { title: type.title }
  }
  return null
}

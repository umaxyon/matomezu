// ページの中で作る物の id: アイテムとその中身・タイプがページに足したフィールドの中の物（ツリーの節など）の、どの深さの id とも重ならない値を振る。
// 中の作りは知らずに、id を持つ物をたどって集める。見るのは渡したページの中だけ（ブックのほかのページの id と重ならないことは、core がアクションの run に渡す newId が守る。core/perform.ts の runAction）

import type { CoreCatalog } from "../../../core/core-catalog"
import type { ShapeData } from "../../../core/def/item"
import { idMaker, idsIn, renamedIn } from "../../../core/ids"
import type { ItemPage } from "../../../core/placed"

declare module "../../../core/catalog" {
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    // false なら、中の id を振り直した写し（renewedIds）で壊れる形（中の id を指す項目を持つなど）。コピーして貼るときも、ページを複製するときも写さない。書かなければ写せる
    survivesRenewedIds?: false
  }
}

// 値 value の中（どの深さも）に、id を振り直した写しで壊れる形（定義の survivesRenewedIds が false）が無いか
export function survivesRenewedIds(catalog: CoreCatalog, value: unknown): boolean {
  if (Array.isArray(value)) return value.every(v => survivesRenewedIds(catalog, v))
  if (typeof value !== "object" || value === null) return true
  const { item } = value as { item?: unknown }
  const def = typeof item === "string" ? catalog.items.get(item) : undefined
  if (def?.kind === "shape" && def.survivesRenewedIds === false) return false
  return Object.values(value).every(v => survivesRenewedIds(catalog, v))
}

// ページ page の中で作る物の id を、続けて何個でも振る関数（そのページの中身のどの深さの id とも、振った id どうしも重ならない。ページの id は含めない）
export function contentIdMaker(page: ItemPage, newId: () => string): () => string {
  const { id: _page, ...content } = page
  return idMaker(newId, idsIn(content))
}

// 値 value の中の id（どの深さのオブジェクトの id）を、ページ page の中身のどの id とも重ならない新しい id に振り直した写し。
// つなぐ相手（from・to）も、写した中の id なら付け替える（写しの外の id はそのまま）。同じ newId の並びなら同じ id になる
export function renewedIds<T>(page: ItemPage, value: T, newId: () => string): T {
  const { id: _page, ...content } = page
  const make = idMaker(newId, idsIn(content))
  return renamedIn(value, new Map(idsIn(value).map(id => [id, make()])))
}

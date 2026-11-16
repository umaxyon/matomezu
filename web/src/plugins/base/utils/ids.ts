// ページの中で作る物の id: アイテムとその中身・タイプがページに足したフィールドの中の物（ツリーの節など）の、どの深さの id とも重ならない値を振る。
// 中の作りは知らずに、id を持つ物をたどって集める。見るのは渡したページの中だけ（ブックのほかのページの id と重ならないことは、core がアクションの run に渡す newId が守る。core/perform.ts の runAction）

import { idMaker, idsIn, renamedIn } from "../../../core/ids"
import type { ItemPage } from "../../../core/placed"

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

// ページの中で作る物の id: アイテムとその中身・タイプがページに足したフィールドの中の物（ツリーの節など）の、どの深さの id とも重ならない値を振る。
// 中の作りは知らずに、id を持つ物をたどって集める。ページが対象のアクションは、自分のページの中だけを見る形（contentIdMaker・renewedIds）を使い、
// ページを作る・写すアクション（ブックが対象）は、ブックの全部を見る形（contentIdMakerOfBook・renewedIdsOfBook）を使う

import { pagesOf } from "../../../core/book"
import { idMaker, idsIn, renamedIn } from "../../../core/ids"
import type { ItemPage } from "../../../core/placed"
import type { Book } from "../../../core/schema/book"

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

// ブック book のどのページの中で作る物の id も、続けて何個でも振る関数（ブックの全部のページの中身の id とも、振った id どうしも重ならない。ページの id は含めない）
export function contentIdMakerOfBook(book: Book, newId: () => string): () => string {
  return idMaker(
    newId,
    pagesOf(book).flatMap(({ id: _page, ...content }) => idsIn(content)),
  )
}

// 値 value の中の id（どの深さのオブジェクトの id）を、ブック book のどの id とも重ならない新しい id に振り直した写し。
// つなぐ相手（from・to）も、写した中の id なら付け替える（写しの外の id はそのまま）。同じ newId の並びなら同じ id になる
export function renewedIdsOfBook<T>(book: Book, value: T, newId: () => string): T {
  const make = idMaker(newId, idsIn(book))
  return renamedIn(value, new Map(idsIn(value).map(id => [id, make()])))
}

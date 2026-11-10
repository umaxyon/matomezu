// ページの中で作る物の id: ブックの全部のページの、アイテムとその中身・タイプがページに足したフィールドの中の物（ツリーの節など）の、
// どの深さの id とも重ならない値を振る。中の作りは知らずに、id を持つ物をたどって集める。ページの id は含めない（ページを足すときに別に振る）
import type { PagedBook } from "../../../core/book"
import { idMaker, idsIn, renamedIn } from "../../../core/ids"

// ページの中で作る物の id を、続けて何個でも振る関数（振った id どうしも重ならない）
export function contentIdMaker(book: PagedBook, newId: () => string): () => string {
  return idMaker(
    newId,
    book.pages.flatMap(({ id: _page, ...content }) => idsIn(content)),
  )
}

// 値 value の中の id（どの深さのオブジェクトの id）を、ブック book のどの id とも重ならない新しい id に振り直した写し。
// つなぐ相手（from・to）も、写した中の id なら付け替える（写しの外の id はそのまま）。同じ newId の並びなら同じ id になる
export function renewedIds<T>(book: PagedBook, value: T, newId: () => string): T {
  const make = idMaker(newId, idsIn(book))
  return renamedIn(value, new Map(idsIn(value).map(id => [id, make()])))
}

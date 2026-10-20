// ブックのタイプの表。足すときは、定義のファイルを作ってここに 1 行足す。
// ブックのデータの形（schema/book.ts）はこの表だけから作る（アクションなどほかの表に依存しない）

import type { BookTypeDef, NewBook } from "../def/book-type"
import { fail } from "../errors"
import type { BookOf } from "../schema/book"
import { DRAWING } from "./drawing"
import { MASTER } from "./master"

export const BOOK_TYPES = [DRAWING, MASTER] as const satisfies readonly BookTypeDef[]

// 何冊も作れるタイプ
type ManyTypes = Extract<(typeof BOOK_TYPES)[number], { single: false }>
export type CreatableTypeId = ManyTypes["id"]
export const CREATABLE_TYPES = BOOK_TYPES.filter((t): t is ManyTypes => !t.single).map(t => t.id) as [
  CreatableTypeId,
  ...CreatableTypeId[],
]

// そのタイプの空のブック
export function createBook<T extends CreatableTypeId>(type: T, init: NewBook): BookOf<T> {
  const def = BOOK_TYPES.find((t): t is Extract<ManyTypes, { id: T }> => t.id === type)
  if (!def) return fail("E104", { type })
  return def.create(init) as BookOf<T>
}

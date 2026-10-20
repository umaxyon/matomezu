// ブックのタイプの表。足すときは、定義のファイルを作ってここに 1 行足す。
// ブックのデータの形（schema/book.ts）はこの表だけから作る（アクションなどほかの表に依存しない）

import type { BookTypeDef } from "../def/book-type"
import { DRAWING } from "./drawing"
import { MASTER } from "./master"

export const BOOK_TYPES = [DRAWING, MASTER] as const satisfies readonly BookTypeDef[]

// 中の部品の、何冊も作れるタイプ
export type CreatableTypeId = Extract<(typeof BOOK_TYPES)[number], { single: false }>["id"]

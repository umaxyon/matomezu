// ブックのタイプの表。足すときは、定義のファイルを作ってここに 1 行足す。
// ブックの型（schema/book.ts）は、ここで書き足した型から決まる（アクションなどほかの表に依存しない）

import type { BookTypeDef } from "../def/book-type"
import { DRAWING } from "./drawing"
import { MASTER } from "./master"

export const BOOK_TYPES = [DRAWING, MASTER] as const satisfies readonly BookTypeDef[]

declare module "../tables" {
  interface BookTypeTable {
    drawing: typeof DRAWING
    master: typeof MASTER
  }
}

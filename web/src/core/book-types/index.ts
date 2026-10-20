// ブックのタイプの表。足すときは、定義のファイルを作ってここに 1 行足す。
// ブックのデータの形（schema/book.ts）はこの表だけから作る（アクションなどほかの表に依存しない）
import type { BookTypeDef } from "../def/book-type"
import { DRAWING } from "./drawing"
import { MASTER } from "./master"

export const BOOK_TYPES = [DRAWING, MASTER] as const satisfies readonly BookTypeDef[]

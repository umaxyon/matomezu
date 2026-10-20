// ブックの一覧: 開けるブックを id ごとに持つ。表にある 1 冊だけのタイプのブックはいつもある
import type { Book } from "./schema/book"

export type Library = Readonly<Record<string, Book>>

// ブックの一覧: 開けるブックを id ごとに持つ。マスターのブックはいつも 1 冊ある
import type { Book, BookOf } from "./schema/book"

export type Library = Readonly<Record<string, Book>>

export function masterOf(library: Library): BookOf<"master"> | undefined {
  return Object.values(library).find((b): b is BookOf<"master"> => b.type === "master")
}

// 参照エントリの、指す先のタイプと名前（ページタブと書庫の画面の参照エントリの行が描く）
import type { Library } from "../../../core/folders"
import { targetOf } from "../../../core/references"
import type { ReferenceEntry } from "../../../core/schema/book"

// 参照エントリ ref の指す先のタイプと名前（ページはそのタイプ、バインダは入れるページのタイプ。指す先の行が無ければ null。ゴミ箱の中なども、行が在れば答える）
export function referenceLook(library: Library, ref: ReferenceEntry): { type: string; title: string } | null {
  const found = targetOf(library, ref)
  if (found === undefined) return null
  return found.kind === "page"
    ? { type: found.page.type, title: found.page.title }
    : { type: found.binder.pageType, title: found.binder.title }
}

// 書庫の検索の作業履歴: tickets-history の中の、作業のレコードの名前を引けるワーカーブック（ワークルーム自身の物は名前を引けないので出ない）から、
// 作業のレコードの名前（短く呼ぶ名前か名前）に言葉を含むブックと、名前に言葉を含む中のバインダ・ページを探す

import type { CoreCatalog } from "../../../core/core-catalog"
import { backyardBooksOf, type Naming, titleOf } from "../../../core/entries"
import type { Library } from "../../../core/folders"
import type { RecordReader } from "../../../core/record-source"
import { type WorkRecordName, workRecordNameOf } from "../participant/activity"
import { TICKETS_HISTORY } from "./backyards"
import { type LibraryRow, NO_TITLE, NO_TYPE, rowsIn } from "./outline"
import { NO_DESKS } from "./workdesk-rows"

// 作業履歴の見つかった行 1 つ: 行 row（ブック・バインダ・ページ）と、その作業のレコードの名前 work と、押したときに開く行 opens
// （ページの行とブックの行はその行、バインダの行は中の最初のページ。ページの無いバインダはそのバインダ）
export interface WorkHistoryRow {
  row: LibraryRow
  work: WorkRecordName
  opens: LibraryRow
}

const NOTHING: readonly WorkHistoryRow[] = []

// 書庫 library の作業履歴から、言葉 word（searchWord で整えた物。空なら探さない）を含む物。read は workRecordNameReadsOf の種類を読める読み口。
// 並びは、作業のレコードの短く呼ぶ名前の新しい順（数を数として比べた逆の順。例: M-10000 が M-9999 より先）。ブックの行の後に、その中の物を並びの順に
export function workHistoryFoundOf(
  catalog: CoreCatalog,
  read: RecordReader,
  library: Library,
  word: string,
  naming: Naming,
): readonly WorkHistoryRow[] {
  if (word === "") return NOTHING
  const has = (text: string) => text.toLocaleLowerCase().includes(word)
  const books = backyardBooksOf(library, TICKETS_HISTORY.id).flatMap(b => {
    const work = workRecordNameOf(catalog, read, b.workKey)
    return work ? [{ book: b.id, work }] : []
  })
  books.sort((a, b) => b.work.label.localeCompare(a.work.label, undefined, { numeric: true }))
  const found: WorkHistoryRow[] = []
  for (const { book, work } of books) {
    const bookRow = bookRowOf(library, book, naming)
    if (bookRow === undefined) continue
    if (has(work.label) || has(work.name)) found.push({ row: bookRow, work, opens: bookRow })
    for (const row of rowsIn(library, book, naming, NO_DESKS)) {
      const inside = row.kind === "binder" ? rowsIn(library, row.id, naming, NO_DESKS) : []
      if (has(row.title)) found.push({ row, work, opens: inside[0] ?? row })
      for (const page of inside) if (has(page.title)) found.push({ row: page, work, opens: page })
    }
  }
  return found.length === 0 ? NOTHING : found
}

// ワーカーブック book の行（表に無ければ undefined）
function bookRowOf(library: Library, book: string, naming: Naming): LibraryRow | undefined {
  const row = library.folders[book]
  if (row?.folderRole !== "book") return undefined
  const title = titleOf(library, "book", book, naming) ?? NO_TITLE
  return { kind: "book", id: book, title, type: NO_TYPE, readable: true, locked: row.locked === true }
}

// 書庫の検索の作業履歴: tickets-history の中の、作業のレコードの名前を引けるワーカーブック（ワークルーム自身の物は名前を引けないので出ない）から、
// 作業のレコードの名前（短く呼ぶ名前か名前）に言葉を含むブックと、名前に言葉を含む中のバインダ・ページを探す

import type { CoreCatalog } from "../../../core/core-catalog"
import { type Naming, titleOf } from "../../../core/entries"
import { backyardIdOf, type Library } from "../../../core/folders"
import type { RecordReader } from "../../../core/record-source"
import { TICKETS_HISTORY } from "../library/backyards"
import { type LibraryRow, NO_TITLE, NO_TYPE, rowsIn } from "../library/outline"
import { NO_DESKS } from "../library/workdesk-rows"
import { type WorkName, workNameOf } from "./activity"

// 作業履歴の見つかった行 1 つ: 行 row（ブック・バインダ・ページ）と、それを持つワーカーブック book と、その作業のレコードの名前 work。
// opens は押したときに開くページ（ページの行はそのページ、バインダの行は中の最初のページ。ブックの行と、ページの無いバインダの行は無し）
export interface WorkHistoryRow {
  row: LibraryRow
  book: string
  work: WorkName
  opens?: string
}

const NOTHING: readonly WorkHistoryRow[] = []

// 書庫 library の作業履歴から、言葉 word（searchWord で整えた物。空なら探さない）を含む物。read は workNameReadsOf の種類を読める読み口。
// 並びは、作業のレコードの短く呼ぶ名前の新しい順（数を数として比べた逆の順。例: M-0196 が M-0177 より先）。ブックの行の後に、その中の物を並びの順に
export function workHistoryFoundOf(
  catalog: CoreCatalog,
  read: RecordReader,
  library: Library,
  word: string,
  naming: Naming,
): readonly WorkHistoryRow[] {
  const backyard = library.folders[backyardIdOf(TICKETS_HISTORY.id)]
  if (word === "" || backyard?.folderRole !== "backyard") return NOTHING
  const has = (text: string) => text.toLocaleLowerCase().includes(word)
  const books = backyard.lineup.flatMap(r => {
    const work = workNameOf(catalog, read, r.workKey)
    return work ? [{ book: r.id, work }] : []
  })
  books.sort((a, b) => b.work.label.localeCompare(a.work.label, undefined, { numeric: true }))
  const found: WorkHistoryRow[] = []
  for (const { book, work } of books) {
    const bookRow = bookRowOf(library, book, naming)
    if (bookRow === undefined) continue
    if (has(work.label) || has(work.name)) found.push({ row: bookRow, book, work })
    for (const row of rowsIn(library, book, naming, NO_DESKS)) {
      const inside = row.kind === "binder" ? rowsIn(library, row.id, naming, NO_DESKS) : []
      if (has(row.title)) {
        const opens = row.kind === "page" ? row.id : inside[0]?.id
        found.push({ row, book, work, ...(opens === undefined ? {} : { opens }) })
      }
      for (const page of inside) if (has(page.title)) found.push({ row: page, book, work, opens: page.id })
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

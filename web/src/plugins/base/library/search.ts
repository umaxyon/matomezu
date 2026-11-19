// 書庫の画面の検索: 名前に言葉 query を含む物（フォルダ・ブック・バインダ・ページ）を、書庫ホームから下へ並びの順に探す。ゴミ箱の物は出ない
import { entriesIn, titleOf } from "../../../core/entries"
import { HOME_ID, type Library } from "../../../core/folders"
import { type LibraryRow, NO_TITLE, rowsIn } from "./outline"

// 見つかった行 1 つ: 行と、それを持つフォルダ holder と、置き場所 place（書庫ホームの下から holder までのフォルダの名前。書庫ホームの直下なら空。名前の無い物は NO_TITLE）
export interface FoundRow extends LibraryRow {
  holder: string
  place: readonly string[]
}

// 探す言葉（前後の空白を除く。大文字と小文字は分けない）。空なら、探さない
export const searchWord = (query: string | undefined): string => (query ?? "").trim().toLocaleLowerCase()
export const NO_SEARCH = ""

const NOTHING: readonly FoundRow[] = []

export function foundRowsOf(library: Library, query: string | undefined): readonly FoundRow[] {
  const word = searchWord(query)
  if (word === NO_SEARCH) return NOTHING
  const found: FoundRow[] = []
  const under = (holder: string, place: readonly string[]) => {
    if (entriesIn(library.folders, holder).length === 0) return
    for (const row of rowsIn(library, holder)) {
      if (row.title.toLocaleLowerCase().includes(word)) found.push({ ...row, holder, place })
      if (row.kind !== "page") under(row.id, [...place, titleOf(library, "folder", row.id) ?? NO_TITLE])
    }
  }
  under(HOME_ID, [])
  return found.length === 0 ? NOTHING : found
}

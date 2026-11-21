// 検索ダイアログの、base のプラグイン状態での持ち方: 開いている間の検索（search）、動かしたダイアログの位置（searchAt。閉じても覚える）、
// 閉じたときにビューが選ぶ今の当たり（searchPick。閉じるたびに番号を進める）
import type { Point } from "../../../core/geom"
import { kit } from "../kit"
import type { SearchQuery } from "./find"

// 今の当たり: ページ page の、原文の [start, end)
export interface SearchSpot {
  page: string
  start: number
  end: number
}

export interface SearchOpen {
  query: SearchQuery
  replacement: string // 置き換える字
  scope: "page" | "book" // 探す範囲（開いているページか、ブックの全部のページ）
  wrap: boolean // 端まで行ったら反対の端から続ける
  current: SearchSpot | "none" // 今の当たり（まだ選んでいなければ none）
  focus: "find" | "replace" // 開いたときに焦点を当てる入力Form
  opened: number // 開くたびに進める番号（開き直したら焦点を当て直す）
}

// ステージに覚えた検索 search を、今開いている物で読んだ値: ブックを開いていなければ（inBook が false。ブックの外のページ）、範囲はいつも page。
// ブックの全部を探していたステージにブックの外のページを開くと、覚えた範囲は book のまま残る。SEARCH_STATE を読む所は、これを通す
export const searchHere = <S extends SearchOpen | undefined>(search: S, inBook: boolean): S =>
  search && !inBook && search.scope === "book" ? { ...search, scope: "page" } : search

export interface SearchPick extends SearchSpot {
  n: number // 閉じるたびに進める番号（ビューが前に選んだ物と見分ける）
}

export const SEARCH_STATE = kit.definePluginStateOf<SearchOpen>()({ id: "search", scope: "stage" })
export const SEARCH_AT_STATE = kit.definePluginStateOf<Point>()({ id: "search-at", scope: "stage" })
export const SEARCH_PICK_STATE = kit.definePluginStateOf<SearchPick>()({ id: "search-pick", scope: "stage" })

export const SEARCH_STATES = [SEARCH_STATE, SEARCH_AT_STATE, SEARCH_PICK_STATE] as const

export const NEW_SEARCH: Omit<SearchOpen, "scope" | "focus" | "opened"> = {
  query: { text: "", caseSensitive: false, regex: false },
  replacement: "",
  wrap: true,
  current: "none",
}

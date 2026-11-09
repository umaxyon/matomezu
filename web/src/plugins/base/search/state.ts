// 検索ダイアログの、base のステージの画面の状態での持ち方: 開いている間の検索（search）、動かしたダイアログの位置（searchAt。閉じても覚える）、
// 閉じたときにビューが選ぶ今の当たり（searchPick。閉じるたびに番号を進める）
import type { Point } from "../../../core/geom"
import { nullableItem } from "../utils/state-item"
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

export interface SearchPick extends SearchSpot {
  n: number // 閉じるたびに進める番号（ビューが前に選んだ物と見分ける）
}

const SEARCH = nullableItem<SearchOpen>("search")
const SEARCH_AT = nullableItem<Point>("searchAt")
const SEARCH_PICK = nullableItem<SearchPick>("searchPick")

export const searchIn = SEARCH.read
export const withSearch = SEARCH.write
export const searchAtIn = SEARCH_AT.read
export const withSearchAt = SEARCH_AT.write
export const searchPickIn = SEARCH_PICK.read
export const withSearchPick = SEARCH_PICK.write

export const NEW_SEARCH: Omit<SearchOpen, "scope" | "focus" | "opened"> = {
  query: { text: "", caseSensitive: false, regex: false },
  replacement: "",
  wrap: true,
  current: "none",
}

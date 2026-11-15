// 横断検索のフック: ホストに横断検索を頼む関数と、左サイドパネルの横断検索を開閉する関数

import type { WideSearchAnswer, WideSearchQuery } from "../../../core/wide-search"
import { useInstance } from "../../../ui/store-context"
import { useLeftSidePanelShows, useToggleLeftSidePanel } from "../left-side-panel/hooks"
import { wideSearchEntries } from "./tab-id"

// 画面の口の件数の上限（ホストと同じ）
export const WIDE_SEARCH_LIMIT_MAX = 1000

// ホストの横断検索（GET /api/search）を頼む関数。断られた・つながらなければ投げる
export function useWideSearch(): (query: WideSearchQuery) => Promise<WideSearchAnswer> {
  return useInstance().search
}

// 横断検索の左サイドパネル（横断検索のタブ）を開閉する。open は、今そのタブを開いているか。
// 開く側のウィジェットは、WIDE_SEARCH_OPENS を opens に書く（タブの中身が開けるスロットを使うため）
export function useWideSearchPanel(): { open: boolean; toggle: () => void } {
  const toggle = useToggleLeftSidePanel()
  const open = useLeftSidePanelShows(wideSearchEntries)
  return { open, toggle: () => toggle(wideSearchEntries) }
}

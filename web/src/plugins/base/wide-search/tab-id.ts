// 横断検索のタブ（左サイドパネルのタブのウィジェット wide-search）の id と、開く側が渡すタブの組。開く側（コントロールセンターの虫メガネ）と中身の両方が読む
import { kit } from "../kit"
import type { LeftSidePanelEntry } from "../left-side-panel/state"

export const WIDE_SEARCH_TAB_ID = kit.name("wide-search")

export const wideSearchEntries: readonly LeftSidePanelEntry[] = [{ tab: WIDE_SEARCH_TAB_ID, props: {} }]

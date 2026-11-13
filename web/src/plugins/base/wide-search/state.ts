// 横断検索のパネル（左サイドパネルのタブ）の画面の状態（窓の中だけ）: 最後に選んだモードのウィジェットの id（開き直したら同じモードで開く）
import { kit } from "../kit"

export const WIDE_SEARCH_MODE = kit.definePluginStateOf<string>()({ id: "wide-search-mode", scope: "window" })

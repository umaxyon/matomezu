// 描いている場所のステージに覚えた検索を、今開いている物で読むフック（state.ts の searchHere を通す。コマンドの文脈の searchOf と同じ決まり）

import { useCallback, useMemo } from "react"
import { NO_BOOK } from "../../../store/commands/def"
import { usePluginState, useReadPluginState } from "../../../ui/plugin-state-hooks"
import { useBook } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { SEARCH_STATE, type SearchOpen, searchHere } from "./state"

export function useSearchHere(): SearchOpen | undefined {
  const search = usePluginState(kit, SEARCH_STATE)
  const inBook = useBook() !== NO_BOOK
  return useMemo(() => searchHere(search, inBook), [search, inBook])
}

// 呼んだ時点の値を読む関数（描き直しを待たずに、今の値から次の値を作るとき）
export function useReadSearchHere(): () => SearchOpen | undefined {
  const read = useReadPluginState(kit, SEARCH_STATE)
  const inBook = useBook() !== NO_BOOK
  return useCallback(() => searchHere(read(), inBook), [read, inBook])
}

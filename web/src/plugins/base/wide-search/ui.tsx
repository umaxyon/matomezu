// 横断検索の見た目: モードと開き方を名乗る関数、タブ、base が名乗る「全文」のモード

import type { ReactNode } from "react"
import type { MessageKey } from "../../../core/i18n/i18n"
import type { WideSearchHit } from "../../../core/wide-search"
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { defineLeftSidePanelTab, opensOf } from "../left-side-panel/ui"
import type { Choice } from "../utils/ChoiceBubble"
import { type PlaceInSlot, placeIn } from "../utils/place-in"
import { FullTextMode } from "./FullTextMode"
import { WIDE_SEARCH_MODES, WIDE_SEARCH_OPENERS, type WideSearchModeProps } from "./slots"
import { WIDE_SEARCH_TAB_ID } from "./tab-id"
import { WideSearchPanel } from "./WideSearchPanel"

// 横断検索のモード（スロット wide-search-modes に置く）。title は切り替えに出す名前（文言の鍵）。
// view は、入力の文字を受けて、入力の下のパネルを描く。place は、追加プラグインが既定の UI マッピングに足してほしいとき（true なら末尾）
export const defineWideSearchMode = <const Id extends string>(def: {
  id: Id
  title: MessageKey
  place?: PlaceInSlot
  view: (props: WideSearchModeProps) => ReactNode
}) =>
  defineWidget({
    id: def.id,
    slots: [WIDE_SEARCH_MODES],
    ...(def.place ? { place: placeIn(WIDE_SEARCH_MODES, def.place) } : {}),
    wideSearchMode: { title: def.title },
    view: def.view,
  })

// 横断検索の当たりを開く関数の答え: 開いた（opened）か、開き方を選ばせる物の並び
export type WideSearchOpened = "opened" | readonly Choice[]

// 種類 kind（種類の本当の id）の横断検索の当たりの開き方（スロット wide-search-openers に置く）。kind の持ち主のプラグインだけが名乗れる（違えば台帳アセンブルで E312 の error）。同じ種類に持ち主が 2 つ書いたときは、並びの先の物を使う。
// useOpen は、横断検索の当たりを開く関数を返すフック（開いても、パネルは開いたまま）。開いたら "opened" を、開き方を利用者に選ばせるなら選ぶ物の並びを返す（押した行の下に吹き出しで出す）。useLabel は、横断検索の当たりの名前を画面の持つ物から作る関数を返すフック（返さなければ、ホストが返す label）。開き方を名乗っていない種類の当たりは、押せない行になる
export const defineWideSearchOpener = <const Id extends string>(def: {
  id: Id
  kind: string
  place?: PlaceInSlot
  useOpen: () => (hit: WideSearchHit) => WideSearchOpened
  useLabel?: () => (hit: WideSearchHit) => string | undefined
}) =>
  defineWidget({
    id: def.id,
    slots: [WIDE_SEARCH_OPENERS],
    ...(def.place ? { place: placeIn(WIDE_SEARCH_OPENERS, def.place) } : {}),
    forKind: def.kind,
    wideSearchOpener: { useOpen: def.useOpen, ...(def.useLabel ? { useLabel: def.useLabel } : {}) },
    view: () => null,
  })

// 全文: 文字列だけで、ホストの探せる種類の全部を探す
export const FULL_TEXT_MODE = defineWideSearchMode({
  id: kit.name("wide-search-full-text"),
  title: kit.message("Full text"),
  view: FullTextMode,
})

// 横断検索のタブ（左サイドパネル）: 入力・モードの切り替え・選んだモードのパネル。モードと開き方のスロットを開ける
export const WIDE_SEARCH_TAB = defineLeftSidePanelTab<typeof WIDE_SEARCH_TAB_ID>({
  id: WIDE_SEARCH_TAB_ID,
  title: kit.message("Wide search"),
  opens: [WIDE_SEARCH_MODES, WIDE_SEARCH_OPENERS],
  view: WideSearchPanel,
})

// 横断検索のタブを開く側（コントロールセンターの虫メガネ）が名乗る opens
export const WIDE_SEARCH_OPENS = opensOf(WIDE_SEARCH_TAB)

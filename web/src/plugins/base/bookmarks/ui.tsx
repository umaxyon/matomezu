// しおり: 置き場のウィジェット（根に置く）と、しおりを出すウィジェットを名乗る defineBookmarks
import type { ReactNode } from "react"
import type { SlotId } from "../../../core/catalog"
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { type PlaceInSlot, placeIn } from "../utils/place-in"
import { BookmarkHost } from "./BookmarkHost"
import { BOOKMARKS } from "./slots"

export const BOOKMARK_HOST = defineWidget({
  id: kit.name("bookmark-host"),
  slots: ["root"],
  opens: [BOOKMARKS],
  view: BookmarkHost,
})

// しおりを出すウィジェット（スロット bookmarks に置く）。view は何も描かず、useShowBookmarks で出すしおりを渡す。
// 種類どうしの並びはスロットの並び。opens は、押したときに開く物が通る道（左サイドパネルのタブなど）。place は、追加プラグインが既定の UI マッピングに足してほしいとき（true なら末尾）
export const defineBookmarks = <const Id extends string>(def: {
  id: Id
  place?: PlaceInSlot
  opens?: readonly SlotId[]
  view: () => ReactNode
}) =>
  defineWidget({
    id: def.id,
    slots: [BOOKMARKS],
    ...(def.place ? { place: placeIn(BOOKMARKS, def.place) } : {}),
    ...(def.opens ? { opens: def.opens } : {}),
    view: def.view,
  })

export { type Bookmark, useShowBookmarks } from "./BookmarkHost"
export { LETTER_ICON } from "./letter-icon"
export { BOOKMARKS, type BookmarksProps } from "./slots"
export type { BookmarkTone } from "./tones"

// 決まったスロットの中で、追加プラグインが既定の UI マッピングに足してほしい所の書き方
import type { SlotId } from "../../../core/catalog"
import type { WidgetPlace } from "../../../ui/layout"

// 決まったスロットの中で置いてほしい所: true なら末尾、before・after なら、そのウィジェットのすぐ前・すぐ後ろ
export type PlaceInSlot = true | { before: string } | { after: string }

// スロット slot の中で place に置いてほしいときの、ウィジェットの place
export const placeIn = <S extends SlotId>(slot: S, place: PlaceInSlot): WidgetPlace<S> =>
  place === true ? { slot } : { slot, ...place }

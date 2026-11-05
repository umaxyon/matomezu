// 左ドロワーのウィジェット: 開くボタン（フッタメニューに置く）と、タブを作る関数。入れ物はステージの列が描く（workspace/WorkspaceView.tsx）
import type { ReactNode } from "react"
import type { SlotId } from "../../../core/catalog"
import type { MessageKey } from "../../../core/i18n/i18n"
import { defineWidget, type WidgetPlace } from "../../../ui/layout"
import { kit } from "../kit"
import { STAGE_SLOTS, type StageSlotProps } from "../workspace/ui"
import { LeftDrawerButton } from "./LeftDrawerButton"
import { LEFT_DRAWER } from "./slots"

// 決まったスロットの中で置いてほしい所: true なら末尾、before・after なら、そのウィジェットのすぐ前・すぐ後ろ
export type PlaceInSlot = true | { before: string } | { after: string }

// スロット slot の中で place に置いてほしいときの、ウィジェットの place
export const placeIn = <S extends SlotId>(slot: S, place: PlaceInSlot): WidgetPlace<S> =>
  place === true ? { slot } : { slot, ...place }

// 左ドロワーのタブのウィジェット: 左ドロワーのスロットに置き、タブの名前 title（文言の鍵）を必ず持つ
// opens は、タブの中身が開けるスロット。place は、追加プラグインが既定の配置に足してほしいとき（true なら末尾、before・after ならそのタブの前・後ろ）
export const defineLeftDrawerTab = <const Id extends string>(def: {
  id: Id
  title: MessageKey
  opens?: readonly SlotId[]
  place?: PlaceInSlot
  view: (props: StageSlotProps) => ReactNode
}) =>
  defineWidget({
    id: def.id,
    slots: [LEFT_DRAWER],
    ...(def.opens ? { opens: def.opens } : {}),
    ...(def.place ? { place: placeIn(LEFT_DRAWER, def.place) } : {}),
    leftDrawer: { title: def.title },
    view: def.view,
  })

export const LEFT_DRAWER_BUTTON = defineWidget({
  id: kit.name("left-drawer-button"),
  slots: STAGE_SLOTS,
  view: LeftDrawerButton,
})

// 左サイドパネルのウィジェット: 開くボタン（フッタメニューに置く）と、タブを作る関数。入れ物は骨組み（workspace/WorkspaceView.tsx）が窓に 1 つ描く
import type { ReactNode } from "react"
import type { SlotId } from "../../../core/catalog"
import type { MessageKey } from "../../../core/i18n/i18n"
import { defineWidget, type WidgetPlace } from "../../../ui/layout"
import { kit } from "../kit"
import { STAGE_SLOTS, type StageSlotProps } from "../workspace/ui"
import { LeftSidePanelButton } from "./LeftSidePanelButton"
import { LEFT_SIDE_PANEL } from "./slots"

// 決まったスロットの中で置いてほしい所: true なら末尾、before・after なら、そのウィジェットのすぐ前・すぐ後ろ
export type PlaceInSlot = true | { before: string } | { after: string }

// スロット slot の中で place に置いてほしいときの、ウィジェットの place
export const placeIn = <S extends SlotId>(slot: S, place: PlaceInSlot): WidgetPlace<S> =>
  place === true ? { slot } : { slot, ...place }

// 左サイドパネルのタブのウィジェット: 左サイドパネルのスロットに置き、タブの名前 title（文言の鍵）を必ず持つ
// opens は、タブの中身が開けるスロット。place は、追加プラグインが既定の配置に足してほしいとき（true なら末尾、before・after ならそのタブの前・後ろ）
export const defineLeftSidePanelTab = <const Id extends string>(def: {
  id: Id
  title: MessageKey
  opens?: readonly SlotId[]
  place?: PlaceInSlot
  useCount?: () => number // 開くボタンとタブに出す数（未読など）を読むフック
  view: (props: StageSlotProps) => ReactNode
}) =>
  defineWidget({
    id: def.id,
    slots: [LEFT_SIDE_PANEL],
    ...(def.opens ? { opens: def.opens } : {}),
    ...(def.place ? { place: placeIn(LEFT_SIDE_PANEL, def.place) } : {}),
    leftSidePanel: { title: def.title, ...(def.useCount ? { useCount: def.useCount } : {}) },
    view: def.view,
  })

export const LEFT_SIDE_PANEL_BUTTON = defineWidget({
  id: kit.name("left-side-panel-button"),
  slots: STAGE_SLOTS,
  view: LeftSidePanelButton,
})

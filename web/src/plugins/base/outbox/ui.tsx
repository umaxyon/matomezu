// 送信トレイのウィジェット（左サイドパネルのタブ）と、行の絵のスロット annotation-icon（種類ごとに、defineAnnotationIcon で作ったウィジェットを置く）
import type { ReactNode } from "react"
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { defineLeftSidePanelTab, type PlaceInSlot, placeIn } from "../left-side-panel/ui"
import { Outbox } from "./Outbox"
import { ANNOTATION_ICON, type AnnotationIconProps } from "./slots"

// 種類 annotation の、送信トレイの行の絵のウィジェット（スロット annotation-icon に置く。20px 四方に収める）。
// place は、追加プラグインが既定の配置に足してほしいとき（true なら末尾）
export const defineAnnotationIcon = <const Id extends string>(def: {
  id: Id
  annotation: string
  place?: PlaceInSlot
  view: (props: AnnotationIconProps) => ReactNode
}) =>
  defineWidget({
    id: def.id,
    slots: [ANNOTATION_ICON],
    ...(def.place ? { place: placeIn(ANNOTATION_ICON, def.place) } : {}),
    annotationIcon: { annotation: def.annotation },
    view: def.view,
  })

export const OUTBOX = defineLeftSidePanelTab({
  id: kit.name("outbox"),
  title: kit.message("Outbox"),
  opens: [ANNOTATION_ICON],
  view: Outbox,
})

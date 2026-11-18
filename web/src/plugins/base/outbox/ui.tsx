// 送信トレイのウィジェット（左サイドパネルのタブ）と、行の絵のスロット annotation-icon（種類ごとに、defineAnnotationIcon で作ったウィジェットを置く）
import type { ReactNode } from "react"
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { defineLeftSidePanelTab } from "../left-side-panel/ui"
import { type PlaceInSlot, placeIn } from "../utils/place-in"
import { Outbox } from "./Outbox"
import { ANNOTATION_ICON, type AnnotationIconProps } from "./slots"
import { OUTBOX_TAB_ID } from "./tab-id"

// 種類 annotation の、送信トレイの行の絵のウィジェット（スロット annotation-icon に置く。20px 四方に収める）。annotation の持ち主のプラグインだけが名乗れる（ウィジェットの forKind に入れ、台帳アセンブルが確かめる。違えば E312 の error）。
// place は、追加プラグインが既定の UI マッピングに足してほしいとき（true なら末尾）
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
    forKind: def.annotation,
    view: def.view,
  })

export const OUTBOX = defineLeftSidePanelTab<typeof OUTBOX_TAB_ID>({
  id: OUTBOX_TAB_ID,
  title: kit.message("Outbox"),
  scope: "stage",
  opens: [ANNOTATION_ICON],
  view: Outbox,
})

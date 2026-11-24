// 送信トレイのウィジェット（左サイドパネルのタブ）と、それを開くフッタのボタン、行の絵のスロット annotation-icon（種類ごとに、defineAnnotationIcon で作ったウィジェットを置く）
import type { ReactNode } from "react"
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { LeftSidePanelOpenButton } from "../left-side-panel/OpenButton"
import type { LeftSidePanelEntry } from "../left-side-panel/state"
import { defineLeftSidePanelTab, opensOf } from "../left-side-panel/ui"
import { type PlaceInSlot, placeIn } from "../utils/place-in"
import { STAGE_SLOTS } from "../workspace/ui"
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

// 送信トレイを開くボタン（フッタメニューに置く）: このステージの送信トレイを左サイドパネルに開き、開いていれば閉じる
export const OUTBOX_BUTTON = defineWidget({
  id: kit.name("outbox-button"),
  slots: STAGE_SLOTS,
  opens: opensOf(OUTBOX),
  view: OutboxButton,
})

const OUTBOX_ENTRIES: readonly LeftSidePanelEntry[] = [{ tab: OUTBOX_TAB_ID, props: {} }]

function OutboxButton() {
  return <LeftSidePanelOpenButton entries={OUTBOX_ENTRIES} />
}

export { ANNOTATION_ICON, type AnnotationIconProps } from "./slots"

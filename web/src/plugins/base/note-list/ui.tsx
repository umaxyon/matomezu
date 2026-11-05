// 伝言一覧のウィジェット（左ドロワーのタブ）と、行の絵のスロット annotation-icon（種類ごとに、defineAnnotationIcon で作ったウィジェットを置く）
import type { ReactNode } from "react"
import { defineWidget } from "../../../ui/layout"
import { kit } from "../kit"
import { defineLeftDrawerTab } from "../left-drawer/ui"
import { NoteList } from "./NoteList"
import { ANNOTATION_ICON, type AnnotationIconProps } from "./slots"

// 種類 annotation の、伝言一覧の行の絵のウィジェット（スロット annotation-icon に置く。20px 四方に収める）
export const defineAnnotationIcon = <const Id extends string>(def: {
  id: Id
  annotation: string
  view: (props: AnnotationIconProps) => ReactNode
}) =>
  defineWidget({ id: def.id, slots: [ANNOTATION_ICON], annotationIcon: { annotation: def.annotation }, view: def.view })

export const NOTE_LIST = defineLeftDrawerTab({
  id: kit.name("note-list"),
  title: kit.message("Note list"),
  opens: [ANNOTATION_ICON],
  view: NoteList,
})

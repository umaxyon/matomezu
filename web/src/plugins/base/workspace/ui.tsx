// ステージの骨組み: ステージの列を並べ、列ごとにベーススロットを開ける
import type { ReactNode } from "react"
import { defineWidget } from "../../../ui/layout"
import { DRAWER_SLOTS } from "../book-name/drawer"
import { kit } from "../kit"
import { RIGHT_SIDE_PANEL } from "../right-side-panel/slots"
import { STAGE_BODY, STAGE_BOTTOM, STAGE_CORNER, STAGE_TOP } from "./slots"
import { WorkspaceView } from "./WorkspaceView"

// ステージの列のスロットと、下の行のドロワーのスロット。どれも、そのステージの id を渡す
export interface StageSlotProps {
  stage: string
}
export const STAGE_SLOTS = [STAGE_TOP, STAGE_BOTTOM, STAGE_CORNER, ...DRAWER_SLOTS] as const
// ステージのベーススロット: ステージの骨組み（根に置き、ステージの列を並べるウィジェット）が、列ごとに必ず開けるスロット
export const STAGE_BASE_SLOTS = [STAGE_TOP, STAGE_BODY, STAGE_BOTTOM, STAGE_CORNER] as const

// ステージの骨組みのウィジェット。根に置き、ベーススロットを全部開ける（view が列ごとに描く）。base の workspace の代わりを作るときもこれで作る
export const defineWorkspace = <const Id extends string>(def: { id: Id; view: () => ReactNode }) =>
  defineWidget({ id: def.id, slots: ["root"], opens: STAGE_BASE_SLOTS, view: def.view })

// base の骨組みは、ベーススロットのほかに、ステージの列の右に右サイドパネルのスロットも開ける
export const WORKSPACE = defineWidget({
  id: kit.name("workspace"),
  slots: ["root"],
  opens: [...STAGE_BASE_SLOTS, RIGHT_SIDE_PANEL],
  view: WorkspaceView,
})

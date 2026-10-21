// ステージの骨組み: ステージの列を並べ、列ごとにベーススロットを開ける
import type { ReactNode } from "react"
import { defineWidget } from "../../../ui/layout"
import { WorkspaceView } from "./WorkspaceView"

// ステージの列のスロット。どれも、そのステージの id を渡す
export interface StageSlotProps {
  stage: string
}
export const STAGE_SLOTS = ["stage.top", "stage.bottom", "stage.corner"] as const
// ステージのベーススロット: ステージの骨組み（根に置き、ステージの列を並べるウィジェット）が、列ごとに必ず開けるスロット
export const STAGE_BASE_SLOTS = ["stage.top", "stage.body", "stage.bottom", "stage.corner"] as const

// ステージの骨組みのウィジェット。根に置き、ベーススロットを全部開ける（view が列ごとに描く）。base の workspace の代わりを作るときもこれで作る
export const defineWorkspace = <const Id extends string>(def: { id: Id; view: () => ReactNode }) =>
  defineWidget({ id: def.id, slots: ["app"], opens: STAGE_BASE_SLOTS, view: def.view })

export const WORKSPACE = defineWorkspace({ id: "workspace", view: WorkspaceView })

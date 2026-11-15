// ステージの骨組み: ステージの列を並べ、列ごとにベーススロットを開ける

import type { ReactNode } from "react"
import { defineWidget } from "../../../ui/layout"
import { FOOTER_MENU_SLOTS } from "../book-name/footer-menu"
import { kit } from "../kit"
import { RIGHT_SIDE_PANEL } from "../right-side-panel/slots"
import { BOOK_SCREEN } from "../window/slots"
import { STAGE_BODY, STAGE_BOTTOM, STAGE_CORNER, STAGE_SIDE, STAGE_TOP } from "./slots"
import { WorkspaceView } from "./WorkspaceView"

// ステージの列のスロットと、下の行のフッタメニューのスロット（どれも何も渡さない。置いたウィジェットは、描いている場所からステージを引く）
export const STAGE_SLOTS = [STAGE_TOP, STAGE_BOTTOM, STAGE_CORNER, ...FOOTER_MENU_SLOTS] as const
// ステージのベーススロット: ステージの骨組み（根に置き、ステージの列を並べるウィジェット）が、列ごとに必ず開けるスロット
export const STAGE_BASE_SLOTS = [STAGE_TOP, STAGE_SIDE, STAGE_BODY, STAGE_BOTTOM, STAGE_CORNER] as const

// ステージの骨組みのウィジェット。ブックスクリーンのスロットに置き、ベーススロットを全部開ける（view が列ごとに描く）。base の workspace の代わりを作るときもこれで作る
export const defineWorkspace = <const Id extends string>(def: { id: Id; view: () => ReactNode }) =>
  defineWidget({ id: def.id, slots: [BOOK_SCREEN], opens: STAGE_BASE_SLOTS, view: def.view })

// base の骨組みは、ベーススロットのほかに、ステージの列の右に右サイドパネルのスロットも開ける
export const WORKSPACE = defineWidget({
  id: kit.name("workspace"),
  slots: [BOOK_SCREEN],
  opens: [...STAGE_BASE_SLOTS, RIGHT_SIDE_PANEL],
  view: WorkspaceView,
})

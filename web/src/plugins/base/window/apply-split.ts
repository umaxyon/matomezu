// 上下に分けた並びの変わりを行う（useScreenSplit の applySplit と、状態を読めない base のコマンドが通る、ただ 1 つの道）
import type { OpenedScreen } from "../../../core/window"
import type { Actions } from "../../../store/actions"
import { ONE_SCREEN } from "./one-screen"
import { behindOf, SPLIT_ROWS, type SplitPlan } from "./split"

// 並びの変わり plan を行う（useScreenSplit の applySplit の中身。状態を読めないコマンドからも呼ぶ）: screens は変わる前に開いているスクリーン、value は変わる前の上下に分ける値（分けていなければ undefined）。
// openAfter は、外れた物を閉じたあとに開いているスクリーン（渡さなければ、閉じた物がみな閉じたとみなす）
export function applySplitFrom(
  actions: Pick<Actions, "closeScreen" | "setScreenArrangement">,
  screens: readonly { id: string; stages?: unknown }[], // stages は、ステージを並べるスクリーンなら真
  value: unknown,
  plan: SplitPlan,
  openAfter?: () => readonly Pick<OpenedScreen, "id">[],
): void {
  const was = behindOf(screens, value)
  const staged = new Set(screens.filter(s => s.stages).map(s => s.id))
  const closing = plan.leaving.filter(id => !staged.has(id))
  for (const id of closing) actions.closeScreen(id)
  const open = openAfter?.() ?? screens.filter(s => !closing.includes(s.id))
  const kept = closing.filter(id => open.some(s => s.id === id))
  const behind = [...kept, ...was].filter(
    (id, i, list) => list.indexOf(id) === i && !plan.screens.includes(id) && open.some(s => s.id === id),
  )
  if (plan.screens.length >= 2) actions.setScreenArrangement(SPLIT_ROWS.id, { screens: plan.screens, behind })
  else actions.setScreenArrangement(ONE_SCREEN.id)
}

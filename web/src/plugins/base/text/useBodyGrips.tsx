// 本文の幅のつまみ（TextBlockView の grips）を出すか: 描かれているステージの開いたページで、物 id 1 つだけを選んでいて、紙をずらす道具の間でなく、
// その物を書き換えるアクション action（どれで書き換えるかは使う側が言う）が止められていなければ出す

import type { ActionId } from "../../../core/catalog"
import { NO_PAGE, NO_STAGE, NOTHING_OPENED, shownPageId } from "../../../core/stage"
import { useAllowed, useStage } from "../../../ui/view-hooks"
import { onlySelected } from "../utils/selection"

export function useBodyGrips(id: string, action: ActionId): boolean {
  const at = useStage()
  const shown = shownPageId(at === NO_STAGE ? NOTHING_OPENED : at.opened)
  const page = shown === NO_PAGE ? undefined : shown
  const allowed = useAllowed(action, { page, ids: [id] }).ok
  return allowed && at !== NO_STAGE && !at.pans && onlySelected(at.selection, id)
}

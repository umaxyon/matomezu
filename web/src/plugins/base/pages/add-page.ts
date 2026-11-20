// ページを足して開く: ステージが開いているブックに、アクション page-add でページを足し、そのステージで開いてカレントにする
import type { ArgsOf } from "../../../core/perform"
import { stageIn } from "../../../core/window"
import type { MatomezuInstance } from "../../../store/state"
import { PAGE_ADD } from "./page-add"

export function addPageIn(
  instance: Pick<MatomezuInstance, "state" | "actions">,
  stage: string,
  args: ArgsOf<typeof PAGE_ADD.id>,
): boolean {
  const book = stageIn(instance.state.getState().window, stage)?.opened?.outermost
  if (book === undefined) return false
  const done = instance.actions.perform(PAGE_ADD.id, args, { book })
  if (!done.ok) return false
  instance.actions.openPage(stage, done.result.page)
  return true
}

// ページを足して開く: ステージが開いているブックに、アクション page-add でページを足し、そのステージで開いてカレントにする
import type { ArgsOf } from "../../../core/perform"
import type { MatomezuInstance } from "../../../store/store"
import { PAGE_ADD } from "./page-add"

export function addPageIn(
  instance: Pick<MatomezuInstance, "state" | "actions">,
  stage: string,
  args: ArgsOf<typeof PAGE_ADD.id>,
): boolean {
  const book = instance.state.getState().workspace.stages.find(s => s.id === stage)?.opened?.book
  if (book === undefined) return false
  const done = instance.actions.perform(PAGE_ADD.id, args, { book })
  if (!done.ok) return false
  instance.actions.openPage(stage, done.result.page)
  return true
}

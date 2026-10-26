// ブックを作って開く: アクション book-create でブックを作り、そのステージで開いてカレントにする
import type { ArgsOf } from "../../../core/perform"
import type { MatomezuInstance } from "../../../store/store"

export function createBookIn(
  instance: Pick<MatomezuInstance, "state" | "actions">,
  stage: string,
  args: ArgsOf<"@matomezu/base:book-create">,
): boolean {
  const done = instance.actions.perform("@matomezu/base:book-create", args)
  if (!done.ok) return false
  instance.actions.openBook(stage, done.result.book)
  return true
}

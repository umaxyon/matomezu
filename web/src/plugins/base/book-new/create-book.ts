// ブックを作って開く: アクション book-create でブックを作り、そのステージで開いてカレントにする
import type { ArgsOf } from "../../../core/perform"
import type { MatomezuInstance } from "../../../store/store"
import { BOOK_CREATE } from "./book-create"

export function createBookIn(
  instance: Pick<MatomezuInstance, "state" | "actions">,
  stage: string,
  args: ArgsOf<typeof BOOK_CREATE.id>,
): boolean {
  const done = instance.actions.perform(BOOK_CREATE.id, args)
  if (!done.ok) return false
  instance.actions.openBook(stage, done.result.book)
  return true
}

// ブックを作って開く: アクション book-create でブックを作り、そのステージで開いてカレントにする。同じ名前の物が在って断られたら、トーストで知らせる

import type { ArgsOf } from "../../../core/perform"
import type { MatomezuInstance } from "../../../store/store"
import { kit } from "../kit"
import { titleTaken } from "../utils/refusal"
import { BOOK_CREATE } from "./book-create"

export function createBookIn(
  instance: Pick<MatomezuInstance, "state" | "actions">,
  stage: string,
  args: ArgsOf<typeof BOOK_CREATE.id>,
): boolean {
  const done = instance.actions.perform(BOOK_CREATE.id, args)
  if (!done.ok) {
    if (titleTaken(done))
      instance.actions.showToast({
        kind: "warn",
        message: kit.message("Could not create the book"),
        detail: { message: kit.message("The name is taken") },
      })
    return false
  }
  instance.actions.openBook(stage, done.result.book)
  return true
}

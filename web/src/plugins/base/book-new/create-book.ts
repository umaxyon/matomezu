// ブックを作って開く: アクション book-create でブックを作り、そのステージで開いてカレントにする。画面から作るブックは標準のプロジェクトに属する

import type { ArgsOf } from "../../../core/perform"
import { DEFAULT_PROJECT } from "../../../core/project"
import type { MatomezuInstance } from "../../../store/store"
import { BOOK_CREATE } from "./book-create"

export function createBookIn(
  instance: Pick<MatomezuInstance, "state" | "actions">,
  stage: string,
  args: Omit<ArgsOf<typeof BOOK_CREATE.id>, "project">,
): boolean {
  const full: ArgsOf<typeof BOOK_CREATE.id> = { ...args, project: DEFAULT_PROJECT }
  const done = instance.actions.perform(BOOK_CREATE.id, full)
  if (!done.ok) return false
  instance.actions.openBook(stage, done.result.book)
  return true
}

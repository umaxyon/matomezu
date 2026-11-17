// ブックを作って開く: アクション book-create でブックを作り、そのステージで開いてカレントにする

import type { ArgsOf } from "../../../core/perform"
import type { MatomezuInstance, Performed } from "../../../store/store"
import { BOOK_CREATE } from "./book-create"

type Instance = Pick<MatomezuInstance, "state" | "actions">
type Args = ArgsOf<typeof BOOK_CREATE.id>

// ブックを作り、作れたらステージ stage で開く。アクションの結果を返す（断られたら、その断り）
export function openCreatedBook(instance: Instance, stage: string, args: Args): Performed<typeof BOOK_CREATE.id> {
  const done = instance.actions.perform(BOOK_CREATE.id, args)
  if (done.ok) instance.actions.openBook(stage, done.result.book)
  return done
}

// ブックを作り、作れたらステージ stage で開く。作れたか
export const createBookIn = (instance: Instance, stage: string, args: Args): boolean =>
  openCreatedBook(instance, stage, args).ok

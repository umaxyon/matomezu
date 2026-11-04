// ブックを作って開くフック: アクション book-create でブックを作り、ステージ stage で開いてカレントにする（create-book.ts の createBookIn）。
// 作れたかを返す
import type { ArgsOf } from "../../../core/perform"
import { useInstance } from "../../../ui/store-context"
import type { BOOK_CREATE } from "./book-create"
import { createBookIn } from "./create-book"

export function useCreateBook(stage: string): (args: ArgsOf<typeof BOOK_CREATE.id>) => boolean {
  const instance = useInstance()
  return args => createBookIn(instance, stage, args)
}

// ブックを作って開くフック: アクション book-create でブックを作り、描いている場所（ui/scope.tsx）のステージで開いてカレントにする（create-book.ts の createBookIn）。
// 作れたかを返す
import type { ArgsOf } from "../../../core/perform"
import { useStageId } from "../../../ui/scope"
import { useInstance } from "../../../ui/store-context"
import type { BOOK_CREATE } from "./book-create"
import { createBookIn } from "./create-book"

export function useCreateBook(): (args: ArgsOf<typeof BOOK_CREATE.id>) => boolean {
  const instance = useInstance()
  const stage = useStageId()
  return args => stage !== null && createBookIn(instance, stage, args)
}

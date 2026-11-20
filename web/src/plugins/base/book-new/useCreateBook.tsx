// ブックを作って開くフック: アクション book-create でブックを作り、描いている場所（ui/scope.tsx）のステージで開いてカレントにする（create-book.ts の openCreatedBook）。
// アクションの結果を返す（ステージの外なら null）
import type { ArgsOf } from "../../../core/perform"
import type { Performed } from "../../../store/actions"
import { useStageId } from "../../../ui/scope"
import { useInstance } from "../../../ui/store-context"
import type { BOOK_CREATE } from "./book-create"
import { openCreatedBook } from "./create-book"

export function useCreateBook(): (args: ArgsOf<typeof BOOK_CREATE.id>) => Performed<typeof BOOK_CREATE.id> | null {
  const instance = useInstance()
  const stage = useStageId()
  return args => (stage === null ? null : openCreatedBook(instance, stage, args))
}

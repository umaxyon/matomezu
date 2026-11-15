// ページを足して開くフック: 描いている場所（ui/scope.tsx）のステージが開いているブックに、アクション page-add でページを足し、そのステージで開いてカレントにする（add-page.ts の addPageIn）。
// 足せたかを返す
import type { ArgsOf } from "../../../core/perform"
import { useStageId } from "../../../ui/scope"
import { useInstance } from "../../../ui/store-context"
import { addPageIn } from "./add-page"
import type { PAGE_ADD } from "./page-add"

export function useAddPage(): (args: ArgsOf<typeof PAGE_ADD.id>) => boolean {
  const instance = useInstance()
  const stage = useStageId()
  return args => stage !== null && addPageIn(instance, stage, args)
}

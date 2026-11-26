// ページを足して開くフック: 描いている場所（ui/scope.tsx）のステージが開いているブックに、アクション page-add でページを足し、そのステージで開いてカレントにする（add-page.ts の addPageIn）。
// 認可ステップに止められたら、そのステップの名前をトーストに出す。足せたかを返す
import type { ArgsOf } from "../../../core/perform"
import { NO_STAGE } from "../../../core/stage"
import { useStageId } from "../../../ui/scope"
import { useInstance } from "../../../ui/store-context"
import { addPageIn } from "../pages/add-page"
import type { PAGE_ADD } from "../pages/page-add"
import { useToastDenied } from "./useToastDenied"

export function useAddPage(): (args: ArgsOf<typeof PAGE_ADD.id>) => boolean {
  const instance = useInstance()
  const stage = useStageId()
  const denied = useToastDenied()
  return args => {
    if (stage === NO_STAGE) return false
    const perform: typeof instance.actions.perform = (...a) => {
      const done = instance.actions.perform(...a)
      if (!done.ok) denied(done)
      return done
    }
    return addPageIn({ state: instance.state, actions: { ...instance.actions, perform } }, stage, args)
  }
}

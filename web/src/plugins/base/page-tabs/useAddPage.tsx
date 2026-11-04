// ページを足して開くフック: ステージ stage が開いているブックに、アクション page-add でページを足し、そのステージで開いてカレントにする（add-page.ts の addPageIn）。
// 足せたかを返す
import type { ArgsOf } from "../../../core/perform"
import { useInstance } from "../../../ui/store-context"
import { addPageIn } from "./add-page"
import type { PAGE_ADD } from "./page-add"

export function useAddPage(stage: string): (args: ArgsOf<typeof PAGE_ADD.id>) => boolean {
  const instance = useInstance()
  return args => addPageIn(instance, stage, args)
}

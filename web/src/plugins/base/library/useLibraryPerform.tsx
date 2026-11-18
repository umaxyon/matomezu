// 書庫が対象のアクションを行う関数: 断られたら断りをトーストに出す（refused は、断りの理由が無いときの文言。同じ名前の物が在って断られたら、原因を 2 行目に出す）。
// 行えたかを返す
import { useCatalog } from "../../../ui/store-context"
import { useActions } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { refusalMessage } from "../utils"
import { titleTaken } from "../utils/refusal"

export function useLibraryPerform(): (
  action: string,
  args: unknown,
  refused: Parameters<typeof kit.message>[0],
) => boolean {
  const { perform, showToast } = useActions()
  const catalog = useCatalog().core
  const run = perform as (
    action: string,
    args: unknown,
  ) => { ok: true } | { ok: false; reason: string; permission?: string; kind?: string }
  return (action, args, refused) => {
    const done = run(action, args)
    if (done.ok) return true
    if (titleTaken(done))
      showToast({
        kind: "warn",
        message: kit.message(refused),
        detail: { message: kit.message("The name is taken") },
      })
    else showToast({ kind: "warn", message: refusalMessage(catalog, done, kit.message(refused)) })
    return false
  }
}

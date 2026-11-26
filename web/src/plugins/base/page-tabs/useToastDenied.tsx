// 認可ステップが止めたアクションの断りを、そのステップの名前でトーストに出す関数（ほかの理由の断りは出さない）
import { useCatalog } from "../../../ui/store-context"
import { useActions } from "../../../ui/view-hooks"

export function useToastDenied(): (done: { reason: string; permission?: string }) => void {
  const { showToast } = useActions()
  const catalog = useCatalog().core
  return done => {
    const step = done.reason === "denied" && done.permission ? catalog.permissions.get(done.permission) : undefined
    if (step) showToast({ kind: "warn", message: step.title })
  }
}

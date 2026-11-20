// 節のキャプションと色を書くフック: 書き分けは write.ts の nodeWrite。allowed は、その書き方を認可ステップが止めていないか
import { useAllowed, usePerform } from "../../../../plugin-api/ui"
import { type NodePatch, nodeWrite, nodeWriteAction } from "../write"

export function useNodeWrite(page: string | undefined, isRoot: boolean) {
  const perform = usePerform()
  const allowed = useAllowed(nodeWriteAction(isRoot), page ? { page } : undefined).ok
  const write = (page: string, node: string, patch: NodePatch) => {
    const w = nodeWrite(isRoot, node, patch)
    return perform(w.action, w.args, { page })
  }
  return { allowed, write }
}

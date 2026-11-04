// 節のキャプションと色を書くフック: 根はページのフィールド root として base の page-update で、子はアクション node-update で書く
// （根と子は型が別で、根はページのフィールド）。allowed は、その書き方を認可ステップが止めていないか
import { useAllowed, usePerform } from "../../../../plugin-api/ui"
import { NODE_UPDATE } from "../actions"

export function useNodeWrite(stage: string, page: string | undefined, isRoot: boolean) {
  const perform = usePerform(stage)
  const allowed = useAllowed(
    stage,
    isRoot ? "@matomezu/base:page-update" : NODE_UPDATE.id,
    page ? { page } : undefined,
  ).ok
  const write = (page: string, node: string, patch: { caption?: string; color?: string | null }) =>
    isRoot
      ? perform("@matomezu/base:page-update", { page, fields: { root: patch } })
      : perform(NODE_UPDATE.id, { page, node, ...patch })
  return { allowed, write }
}

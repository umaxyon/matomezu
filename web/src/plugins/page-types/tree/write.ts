// 節のキャプションと色の書き方: 根はページのフィールド root として base の page-update で、子はアクション node-update で書く
// （根と子は型が別で、根はページのフィールド）。その場の編集の確定と、色のスタンドが使う
import { NODE_UPDATE } from "./actions"

export const PAGE_UPDATE = "@matomezu/base:page-update"

// 節に書く物（与えた物だけ替える）
export interface NodePatch {
  caption?: string
  color?: string | null
}

// 節 node（isRoot なら根）に patch を書くアクションと、その引数
export const nodeWrite = (isRoot: boolean, node: string, patch: NodePatch) =>
  isRoot
    ? ({ action: PAGE_UPDATE, args: { fields: { root: patch } } } as const)
    : ({ action: NODE_UPDATE.id, args: { node, ...patch } } as const)

// 節（isRoot なら根）を書くアクション
export const nodeWriteAction = (isRoot: boolean) => (isRoot ? PAGE_UPDATE : NODE_UPDATE.id)

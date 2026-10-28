// ツリーの節のデータ: ページのフィールド root（根）に、子を children の入れ子で持つ。位置は持たず、並べ方から決める（layout.ts）。
// 根は id・キャプション・本文を持ち、子は id とキャプションを持つ。id は呼び出す側が書かず、アクションが振る（足すときに受ける形は NewNodeSchema）
import { z } from "zod"
import { BODY_MAX } from "../../base"

export interface TreeNode {
  id: string
  caption: string
  children?: TreeNode[]
}

export const TreeNodeSchema: z.ZodType<TreeNode> = z.strictObject({
  id: z.string().min(1),
  caption: z.string(),
  get children() {
    return z.array(TreeNodeSchema).optional()
  },
})

export const TreeRootSchema = z.strictObject({
  id: z.string().min(1),
  caption: z.string(),
  body: z.string().max(BODY_MAX).optional(),
  children: z.array(TreeNodeSchema).optional(),
})
export type TreeRoot = z.infer<typeof TreeRootSchema>

// 足すときに受ける節（id は書かない）
export interface NewNode {
  caption: string
  children?: NewNode[]
}

export const NewNodeSchema: z.ZodType<NewNode> = z.strictObject({
  caption: z.string(),
  get children() {
    return z.array(NewNodeSchema).optional()
  },
})

// 振った id（受けた節と同じ入れ子）
export interface GivenId {
  id: string
  children?: GivenId[]
}

// 受けた節に、上から順に id を振る
export function giveIds(nodes: readonly NewNode[], makeId: () => string): { nodes: TreeNode[]; ids: GivenId[] } {
  const out = nodes.map(n => {
    const id = makeId()
    const kids = giveIds(n.children ?? [], makeId)
    return {
      node: { id, caption: n.caption, ...(kids.nodes.length > 0 ? { children: kids.nodes } : {}) },
      given: { id, ...(kids.ids.length > 0 ? { children: kids.ids } : {}) },
    }
  })
  return { nodes: out.map(o => o.node), ids: out.map(o => o.given) }
}

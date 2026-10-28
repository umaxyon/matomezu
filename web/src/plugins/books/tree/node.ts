// ツリーの節のデータ: ページのフィールド root（根）に、子を children の入れ子で持つ。位置は持たず、並べ方から決める（layout.ts）。
// 根は id・キャプション・本文を持ち、子は id とキャプションを持つ。id は呼び出す側が書かず、アクションが振る（足すときに受ける形は NewNodeSchema）。
// 根の直系の子は、中央の木でどの向きへ伸びるか（side。無ければ右）を持てる。ほかの向きの木と、孫より下では使わない。
// 子は大きさの選び方（size。無ければページで効いている選び方）を持てる
import { z } from "zod"
import { BODY_MAX } from "../../base"
import { NODE_SIZES, type NodeSize } from "./size"

export const SIDE_NAMES = ["up", "down", "left", "right"] as const
export type Side = (typeof SIDE_NAMES)[number]

export interface TreeNode {
  id: string
  caption: string
  side?: Side
  size?: NodeSize
  children?: TreeNode[]
}

// 中央の木で、根の直系の子が伸びる向き（無ければ右）
export const sideOf = (node: { side?: Side }): Side => node.side ?? "right"

export const TreeNodeSchema: z.ZodType<TreeNode> = z.strictObject({
  id: z.string().min(1),
  caption: z.string(),
  side: z.enum(SIDE_NAMES).optional(),
  size: z.enum(NODE_SIZES).optional(),
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
  side?: Side
  children?: NewNode[]
}

export const NewNodeSchema: z.ZodType<NewNode> = z.strictObject({
  caption: z.string(),
  side: z.enum(SIDE_NAMES).optional(),
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
      node: {
        id,
        caption: n.caption,
        ...(n.side ? { side: n.side } : {}),
        ...(kids.nodes.length > 0 ? { children: kids.nodes } : {}),
      },
      given: { id, ...(kids.ids.length > 0 ? { children: kids.ids } : {}) },
    }
  })
  return { nodes: out.map(o => o.node), ids: out.map(o => o.given) }
}

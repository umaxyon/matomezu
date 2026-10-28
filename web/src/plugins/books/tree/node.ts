// ツリーの節のデータ: ページのフィールド root（根）に、子を children の入れ子で持つ。位置は持たず、並べ方から決める（layout.ts）。
// 根は id・キャプション・本文を持ち、子は id とキャプションを持つ。id は呼び出す側が書かず、アクションが振る（足すときに受ける形は NewNodeSchema）。
// キャプションと根の本文は、base の本文の装飾（**太字**・{色:文字}）で書ける。キャプションの標準は普通の太さ
// 根の直系の子は、中央の木でどの向きへ伸びるか（side。無ければ右）を持てる。ほかの向きの木と、孫より下では使わない。
// 子は大きさの選び方（size。無ければページで効いている選び方）を持てる。どの節も色（color。代表色の名前か #rrggbb。無ければテーマの塗り）を持てる
import { z } from "zod"
import { HEX, PALETTE } from "../../../plugin-api"
import { bodyText } from "../../base"
import { NODE_SIZES, type NodeSize } from "./size"

export const SIDE_NAMES = ["up", "down", "left", "right"] as const
export type Side = (typeof SIDE_NAMES)[number]

// 節の色（代表色の名前か #rrggbb）
export const NodeColorSchema = z.union([z.enum(PALETTE), z.string().regex(HEX)])

export interface TreeNode {
  id: string
  caption: string
  side?: Side
  size?: NodeSize
  color?: string
  children?: TreeNode[]
}

// 中央の木で、根の直系の子が伸びる向き（無ければ右）
export const sideOf = (node: { side?: Side }): Side => node.side ?? "right"

// キャプションの形（標準は普通の太さ。装飾の書き方を AI に見せる）
const captionText = () =>
  z
    .string()
    .describe(
      "Caption, drawn in normal weight. **bold** makes it bold and {name:text} colors it with a text color (name from textColors); unpaired marks stay as they are",
    )

export const TreeNodeSchema: z.ZodType<TreeNode> = z.strictObject({
  id: z.string().min(1),
  caption: captionText(),
  side: z.enum(SIDE_NAMES).optional(),
  size: z.enum(NODE_SIZES).optional(),
  color: NodeColorSchema.optional(),
  get children() {
    return z.array(TreeNodeSchema).optional()
  },
})

export const TreeRootSchema = z.strictObject({
  id: z.string().min(1),
  caption: captionText(),
  body: bodyText().optional(),
  showBody: z.boolean().optional(), // 本文を紙の上に描くか（無ければ描かない）
  color: NodeColorSchema.optional(),
  children: z.array(TreeNodeSchema).optional(),
})
export type TreeRoot = z.infer<typeof TreeRootSchema>

// 足すときに受ける節（id は書かない）
export interface NewNode {
  caption: string
  side?: Side
  color?: string
  children?: NewNode[]
}

export const NewNodeSchema: z.ZodType<NewNode> = z.strictObject({
  caption: captionText(),
  side: z.enum(SIDE_NAMES).optional(),
  color: NodeColorSchema.optional(),
  get children() {
    return z.array(NewNodeSchema).optional()
  },
})

// 振った id（受けた節と同じ入れ子）
export interface GivenId {
  id: string
  children?: GivenId[]
}

// 受けた節に、上から順に id を振る。色の無い節は、親の色 color を写す（子を足したときに親の色を受け継ぐ）
export function giveIds(
  nodes: readonly NewNode[],
  makeId: () => string,
  color?: string,
): { nodes: TreeNode[]; ids: GivenId[] } {
  const out = nodes.map(n => {
    const id = makeId()
    const own = n.color ?? color
    const kids = giveIds(n.children ?? [], makeId, own)
    return {
      node: {
        id,
        caption: n.caption,
        ...(n.side ? { side: n.side } : {}),
        ...(own ? { color: own } : {}),
        ...(kids.nodes.length > 0 ? { children: kids.nodes } : {}),
      },
      given: { id, ...(kids.ids.length > 0 ? { children: kids.ids } : {}) },
    }
  })
  return { nodes: out.map(o => o.node), ids: out.map(o => o.given) }
}

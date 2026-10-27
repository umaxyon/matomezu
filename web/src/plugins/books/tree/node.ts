// ツリーの節のデータ: ページのフィールド root（根）に、子を children の入れ子で持つ。位置は持たず、並べ方から決める（layout.ts）。
// 根はキャプションと本文を持ち、子は id とキャプションを持つ
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
  caption: z.string(),
  body: z.string().max(BODY_MAX).optional(),
  children: z.array(TreeNodeSchema).optional(),
})
export type TreeRoot = z.infer<typeof TreeRootSchema>

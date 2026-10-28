// ツリーのページのフィールドの受け方（base の page-add・page-update が使う）: 作るときは、根のキャプションと本文に、id の無い子の入れ子を添えて受け、
// 子の全部に id を振って書き、振った id を同じ入れ子で返す。直すときは、根のキャプションと本文の書いた所だけを替え（本文の null は消す）、子には触れない
import { z } from "zod"
import { BODY_MAX, type PageFieldsWay, pageFieldsWay } from "../../base"
import { type TreeNode, TreeRootSchema } from "./node"

// 作るときに受ける子（id は書かない）
interface NewNode {
  caption: string
  children?: NewNode[]
}

const NewNodeSchema: z.ZodType<NewNode> = z.strictObject({
  caption: z.string(),
  get children() {
    return z.array(NewNodeSchema).optional()
  },
})

// 振った id（受けた子と同じ入れ子）
interface GivenId {
  id: string
  children?: GivenId[]
}

// 受けた子に、上から順に id を振る
function giveIds(nodes: readonly NewNode[], makeId: () => string): { nodes: TreeNode[]; ids: GivenId[] } {
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

const ADD_ROOT = z
  .strictObject({
    caption: z.string(),
    body: z.string().max(BODY_MAX).optional(),
    children: z.array(NewNodeSchema).optional(),
  })
  .describe(
    "The root's caption and body, and its children nested (write no ids; the ids given come back in fields.root)",
  )

const UPDATE_ROOT = z
  .strictObject({
    caption: z.string().optional(),
    body: z.string().max(BODY_MAX).nullable().optional(),
  })
  .describe("Only what is given changes (null removes the body). Children do not change here")

export const pageFieldsInput: { add: PageFieldsWay; update: PageFieldsWay } = {
  add: pageFieldsWay({
    args: z.strictObject({ root: ADD_ROOT }),
    write: (_page, input, makeId) => {
      const { children, ...root } = input.root
      if (!children) return { fields: { root } }
      const given = giveIds(children, makeId)
      return { fields: { root: { ...root, children: given.nodes } }, result: { root: { children: given.ids } } }
    },
  }),
  update: pageFieldsWay({
    args: z.strictObject({ root: UPDATE_ROOT.optional() }),
    write: (page, input) => {
      const patch = input.root
      const old = TreeRootSchema.safeParse(page.root)
      if (!old.success) return null
      if (!patch) return { fields: {} }
      const { body, ...rest } = old.data
      const nextBody = patch.body === null ? undefined : (patch.body ?? body)
      return {
        fields: {
          root: {
            ...rest,
            caption: patch.caption ?? old.data.caption,
            ...(nextBody === undefined ? {} : { body: nextBody }),
          },
        },
      }
    },
  }),
}

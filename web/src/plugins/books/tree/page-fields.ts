// ツリーのページのフィールドの受け方（base の page-add・page-update が使う）: 作るときは、根のキャプション・本文・色に、id の無い子の入れ子を添えて受け、
// 根と子の全部に id を振って書き（色の無い子は親の色を写す）、振った id を同じ入れ子で返す。直すときは、根のキャプション・本文・色の書いた所だけを替え（本文と色の null は消す）、子には触れない
import { z } from "zod"
import { BODY_MAX, type PageFieldsWay, pageFieldsWay } from "../../base"
import { giveIds, NewNodeSchema, NodeColorSchema, TreeRootSchema } from "./node"

const ADD_ROOT = z
  .strictObject({
    caption: z.string(),
    body: z.string().max(BODY_MAX).optional(),
    color: NodeColorSchema.optional(),
    children: z.array(NewNodeSchema).optional(),
  })
  .describe(
    "The root's caption, body and color, and its children nested (write no ids; the ids given come back in fields.root). A child without color takes its parent's.",
  )

const UPDATE_ROOT = z
  .strictObject({
    caption: z.string().optional(),
    body: z.string().max(BODY_MAX).nullable().optional(),
    color: NodeColorSchema.nullable().optional(),
  })
  .describe("Only what is given changes (null removes the body or the color). Children do not change here")

export const pageFieldsInput: { add: PageFieldsWay; update: PageFieldsWay } = {
  add: pageFieldsWay({
    args: z.strictObject({ root: ADD_ROOT }),
    write: (_page, input, makeId) => {
      const { children, ...rest } = input.root
      const id = makeId()
      const given = giveIds(children ?? [], makeId, rest.color)
      const root = { id, ...rest, ...(given.nodes.length > 0 ? { children: given.nodes } : {}) }
      return { fields: { root }, result: { root: { id, ...(given.ids.length > 0 ? { children: given.ids } : {}) } } }
    },
  }),
  update: pageFieldsWay({
    args: z.strictObject({ root: UPDATE_ROOT.optional() }),
    write: (page, input) => {
      const patch = input.root
      const old = TreeRootSchema.safeParse(page.root)
      if (!old.success) return null
      if (!patch) return { fields: {} }
      const { body, color, ...rest } = old.data
      const nextBody = patch.body === null ? undefined : (patch.body ?? body)
      const nextColor = patch.color === null ? undefined : (patch.color ?? color)
      return {
        fields: {
          root: {
            ...rest,
            caption: patch.caption ?? old.data.caption,
            ...(nextBody === undefined ? {} : { body: nextBody }),
            ...(nextColor === undefined ? {} : { color: nextColor }),
          },
        },
      }
    },
  }),
}

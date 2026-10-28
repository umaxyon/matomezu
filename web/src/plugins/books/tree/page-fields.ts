// ツリーのページのフィールドの受け方（base の page-add・page-update が使う）: 作るときは、根のキャプションと本文に、id の無い子の入れ子を添えて受け、
// 根と子の全部に id を振って書き、振った id を同じ入れ子で返す。直すときは、根のキャプションと本文の書いた所だけを替え（本文の null は消す）、子には触れない
import { z } from "zod"
import { BODY_MAX, type PageFieldsWay, pageFieldsWay } from "../../base"
import { giveIds, NewNodeSchema, TreeRootSchema } from "./node"

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
      const { children, ...rest } = input.root
      const id = makeId()
      const given = giveIds(children ?? [], makeId)
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

// ディレクトリ構成図のページのフィールドの受け方（base の page-add・page-update が使う）: 作るときは、根のフォルダの名前・説明・色と、id の無い中身の入れ子を受け、
// 根と中身の全部に id を振って書き、振った id を同じ入れ子で返す。直すときは何も受けない（根も中身も、ディレクトリ構成図のアクションで替える）
import { z } from "zod"
import { type PageFieldsWay, pageFieldsWay } from "../../base"
import { descriptionText, EntryColorSchema, giveIds, NewEntrySchema } from "./entry"

const ADD_ROOT = z
  .strictObject({
    name: z.string(),
    description: descriptionText().optional(),
    color: EntryColorSchema.optional(),
    closed: z.boolean().optional(),
    children: z.array(NewEntrySchema).optional(),
  })
  .describe(
    "The root folder's name, description, color and whether it is drawn closed, and its contents nested (write no ids; the ids given come back in fields.root)",
  )

export const pageFieldsInput: { add: PageFieldsWay; update: PageFieldsWay } = {
  add: pageFieldsWay({
    args: z.strictObject({ root: ADD_ROOT }),
    write: (_page, input, makeId) => {
      const given = giveIds([{ kind: "folder", ...input.root }], makeId)
      return { fields: { root: given.entries[0] }, result: { root: given.ids[0] } }
    },
  }),
  update: pageFieldsWay({ args: z.strictObject({}), write: () => ({ fields: {} }) }),
}

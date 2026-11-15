// ディレクトリ構成図のページのフィールドの受け方（base の page-add・page-update が使う）: 作るときは、根のフォルダの名前・説明・アイコンと、id の無い中身の入れ子を受け、
// 根と中身の全部に id を振って書き、振った id を同じ入れ子で返す。直すときは何も受けない（根も中身も、ディレクトリ構成図のアクションで替える）
import { z } from "zod"
import type { CoreCatalog } from "../../../plugin-api"
import { type PageFieldsWay, pageFieldsWay } from "../../base"
import { descriptionText, giveIds, newEntriesProblem, newEntryOf } from "./entry"
import { iconProblem, iconsDescription } from "./entry-icon"

// 作るときに受ける根（アイコンの検査は機能台帳から。選べない物は受けない）
const addRoot = (catalog: CoreCatalog) =>
  z
    .strictObject({
      name: z.string(),
      description: descriptionText().optional(),
      icon: z.string().min(1).optional().describe(iconsDescription(catalog)),
      closed: z.boolean().optional(),
      children: z.array(newEntryOf(iconsDescription(catalog))).optional(),
    })
    .superRefine((root, ctx) => {
      const problem = newEntriesProblem([{ kind: "folder", ...root }], (kind, icon) => iconProblem(catalog, kind, icon))
      if (problem) ctx.addIssue({ code: "custom", message: problem })
    })
    .describe(
      "The root folder's name, description, icon and whether it is drawn closed, and its contents nested (write no ids; the ids given come back in fields.root)",
    )

export const pageFieldsInput: { add: PageFieldsWay; update: PageFieldsWay } = {
  add: pageFieldsWay({
    args: catalog => z.strictObject({ root: addRoot(catalog) }),
    write: (_page, input, makeId) => {
      const given = giveIds([{ kind: "folder", ...input.root }], makeId)
      return { fields: { root: given.entries[0] }, result: { root: given.ids[0] } }
    },
  }),
  update: pageFieldsWay({ args: z.strictObject({}), write: () => ({ fields: {} }) }),
}

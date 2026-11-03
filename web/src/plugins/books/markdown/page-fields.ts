// マークダウンのページのフィールドの受け方（base の page-update が使う）: 原文 text を丸ごと替えるか、原文の中にちょうど 1 か所ある find を replace に替える。
// 両方を一緒には受けない。find が無い・2 か所以上ある（重なる出現も数える）なら断る。作るときは base の受け方（text を丸ごと）
import { z } from "zod"
import { type PageFieldsWay, pageFieldsWay } from "../../base"

// 原文 text の中の find の位置（ちょうど 1 か所でなければ null）
export function onlyPlace(text: string, find: string): number | null {
  const at = text.indexOf(find)
  return at < 0 || text.indexOf(find, at + 1) >= 0 ? null : at
}

export const pageFieldsInput: { update: PageFieldsWay } = {
  update: pageFieldsWay({
    args: z.strictObject({
      text: z.string().describe("The page's whole document, in Markdown, replacing what is there").optional(),
      find: z
        .string()
        .min(1)
        .describe(
          "Text to replace with replace: it must occur exactly once in the document (refused if it occurs nowhere or twice or more, overlaps counted). Not with text",
        )
        .optional(),
      replace: z.string().describe("What find is replaced with (empty removes it)").optional(),
    }),
    write: (page, input) => {
      const { text, find, replace } = input
      if (find === undefined && replace === undefined) return { fields: text === undefined ? {} : { text } }
      if (text !== undefined || find === undefined || replace === undefined) return null
      const now = typeof page.text === "string" ? page.text : ""
      const at = onlyPlace(now, find)
      return at === null ? null : { fields: { text: now.slice(0, at) + replace + now.slice(at + find.length) } }
    },
  }),
}

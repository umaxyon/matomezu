// マークダウンのページのフィールドの受け方（base の page-add・page-update が使う）: 原文 text を丸ごと替えるか、原文の中にちょうど 1 か所ある find を replace に替える。
// 両方を一緒には受けない。find が無い・2 か所以上ある（重なる出現も数える）なら断る。作るときは text を丸ごと。
// 原文の改行はいつも \n だけにする: 書くたびに、書いたあとの原文全体の \r\n と \r を \n にそろえる（受けた find・replace もそろえてから使う）
import { z } from "zod"
import { type PageFieldsWay, pageFieldsWay } from "../../base"

// 原文 text の中の find の位置（ちょうど 1 か所でなければ null）
export function onlyPlace(text: string, find: string): number | null {
  const at = text.indexOf(find)
  return at < 0 || text.indexOf(find, at + 1) >= 0 ? null : at
}

// 改行を \n にそろえた字
export const toLf = (text: string): string => text.replace(/\r\n?/g, "\n")

const TEXT = z.string().describe("The page's whole document, in Markdown, replacing what is there").optional()

export const pageFieldsInput: { add: PageFieldsWay; update: PageFieldsWay } = {
  add: pageFieldsWay({
    args: z.strictObject({ text: TEXT }),
    write: (_page, { text }) => ({ fields: text === undefined ? {} : { text: toLf(text) } }),
  }),
  update: pageFieldsWay({
    args: z.strictObject({
      text: TEXT,
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
      if (find === undefined && replace === undefined) return { fields: text === undefined ? {} : { text: toLf(text) } }
      if (text !== undefined || find === undefined || replace === undefined) return null
      const now = toLf(typeof page.text === "string" ? page.text : "")
      const [from, to] = [toLf(find), toLf(replace)]
      const at = onlyPlace(now, from)
      return at === null ? null : { fields: { text: now.slice(0, at) + to + now.slice(at + from.length) } }
    },
  }),
}

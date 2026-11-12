// 描いた文書で、段落の中の改行 1 つをどう見せるか（利用者の設定の項目）: 改行にするか、GFM のとおり空白にするか。
// 原文の読み方（base の parseMarkdown）は変えず、描くときの見た目で分ける（base の MarkdownDocumentView）。印刷も同じ見た目で測って切る
import { type SoftBreak, SoftBreakSchema } from "../../base"
import { kit } from "./kit"

export const SOFT_BREAK = kit.defineSetting({
  id: "soft-break",
  title: "Line breaks in a paragraph",
  schema: SoftBreakSchema,
  default: "line-break",
  optionTitles: { "line-break": kit.message("Line break"), space: kit.message("Space (GFM)") },
})

// 設定の値（形に合わない値なら既定）
export function softBreakOf(value: unknown): SoftBreak {
  const parsed = SoftBreakSchema.safeParse(value)
  return parsed.success ? parsed.data : SOFT_BREAK.default
}

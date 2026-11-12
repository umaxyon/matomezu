// 描いた文書で、段落の中の改行 1 つをどう見せるか: 改行にするか、GFM のとおり空白にするか。
// 原文の読み方（parseMarkdown）は変えず、描くときの見た目で分ける（MarkdownDocumentView.tsx）。印刷も同じ見た目で測って切る
import { z } from "zod"

export const SoftBreakSchema = z.enum(["line-break", "space"])
export type SoftBreak = z.infer<typeof SoftBreakSchema>

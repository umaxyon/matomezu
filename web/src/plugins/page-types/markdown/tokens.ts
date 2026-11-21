// マークダウンのページのタイプのテーマキー: 描いた文書が受ける物（base の MARKDOWN_DOCUMENT_TOKENS）に、ページの画面（ペインを並べる枠・印刷区画）だけが使う物を足す。
// 宣言はこのプラグインの物（id は @matomezu/markdown:…）で、既定はどのテーマも上書きしないときの見た目
import { MARKDOWN_DOCUMENT_TOKENS } from "../../base"

export const MARKDOWN_TOKENS = [
  ...MARKDOWN_DOCUMENT_TOKENS,
  { id: "markdown-page-padding", value: "24px 32px", shades: "one" }, // 紙の辺と文書の間（編集の見え方の描いた文書と、印刷の印刷区画ごと）
] as const

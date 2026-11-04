// 描いた文書のテーマキー: 色・線のほか、字の大きさ・字体・余白も持つ（マークダウンの文書は並べ方の計算を持たず、描いたあとに測るだけなので、テーマが変えてよい）。
// 既定はどれも、どのテーマも上書きしないときの見た目。em の値は文書の字の大きさに合わせて伸び縮みする。ソースのペインは使わない
import { oneShadeCheck } from "../../../plugin-api/builtin"
import { kit } from "./kit"

// 色でないテーマキー（明暗で別の値を書けない。書いたテーマは組み立てで warning）
export const MARKDOWN_NON_COLOR_TOKENS = [
  { id: "markdown-font-family", value: "var(--skin-font)" }, // 本文の字体
  { id: "markdown-font-size", value: "14px" },
  { id: "markdown-line-height", value: "1.7" },
  { id: "markdown-h1-size", value: "1.8em" },
  { id: "markdown-h2-size", value: "1.45em" },
  { id: "markdown-h3-size", value: "1.2em" },
  { id: "markdown-h4-size", value: "1em" },
  { id: "markdown-h5-size", value: "1em" },
  { id: "markdown-h6-size", value: "1em" },
  { id: "markdown-heading-weight", value: "bold" },
  { id: "markdown-heading-line-height", value: "1.3" },
  { id: "markdown-heading-gap", value: "1.4em 0 0.6em" }, // 見出しの上下の空き（margin）
  { id: "markdown-heading-rule-gap", value: "0.2em" }, // 見出し 1・2 の字と下線の間
  { id: "markdown-block-gap", value: "0.9em" }, // 段落・リスト・引用・コード・表の下の空き
  { id: "markdown-list-indent", value: "1.8em" },
  { id: "markdown-quote-width", value: "3px" }, // 引用の縦線の太さ
  { id: "markdown-quote-padding", value: "0 1em" },
  { id: "markdown-cell-padding", value: "4px 10px" }, // 表のセルの内側の空き
  { id: "markdown-rule-width", value: "1px" }, // 区切り線の太さ（見出しの下線は含めない）
  { id: "markdown-rule-gap", value: "1.4em 0" }, // 区切り線の上下の空き（margin）
  { id: "markdown-footnote-size", value: "0.9em" }, // 脚注の字の大きさ
  { id: "markdown-footnote-gap", value: "2em" }, // 本文と脚注の間
  { id: "markdown-code-font-family", value: "ui-monospace, monospace" },
  { id: "markdown-code-font-size", value: "13px" }, // コードの塊の字の大きさ
  { id: "markdown-code-padding", value: "10px 12px" }, // コードの塊の内側の空き
  { id: "markdown-code-radius", value: "4px" }, // コードの塊と文中のコードの角の丸み
  { id: "markdown-inline-code-size", value: "0.92em" }, // 文中のコードの字の大きさ
  { id: "markdown-inline-code-padding", value: "0.1em 0.3em" },
] as const

export const MARKDOWN_TOKENS = [
  { id: "markdown-text", fallback: "text" }, // 文書の字
  { id: "markdown-hint", fallback: "hint" }, // 引用の字・読み込まない画像の代わりの説明
  { id: "markdown-rule", fallback: "line" }, // 見出しの下線・区切り線
  { id: "markdown-line", fallback: "line" }, // 表の罫・引用の縦線・脚注の線・画像の代わりの枠
  { id: "markdown-link", fallback: "accent" },
  { id: "markdown-code-fill", fallback: "surface" }, // コードの塊と文中のコードの地
  ...MARKDOWN_NON_COLOR_TOKENS,
] as const

export const MARKDOWN_TOKENS_CHECK = oneShadeCheck(MARKDOWN_NON_COLOR_TOKENS.map(t => kit.name(t.id)))

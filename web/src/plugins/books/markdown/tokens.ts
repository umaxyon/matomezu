// 描いた文書のテーマキー: 色・線のほか、字の大きさ・字体・余白も持つ（マークダウンの文書は並べ方の計算を持たず、描いたあとに測るだけなので、テーマが変えてよい）。
// 既定はどれも、どのテーマも上書きしないときの見た目。em の値は文書の字の大きさに合わせて伸び縮みする。ソースのペインは使わない（色でないテーマキーは明暗で同じ値だけ。shades: "one"）
export const MARKDOWN_TOKENS = [
  { id: "markdown-text", fallback: "text" }, // 文書の字
  { id: "markdown-hint", fallback: "hint" }, // 引用の字・読み込まない画像の代わりの説明
  { id: "markdown-rule", fallback: "line" }, // 区切り線
  { id: "markdown-heading-rule", fallback: "line" }, // 見出し 1・2 の下線
  { id: "markdown-line", fallback: "line" }, // 表の罫・引用の縦線・脚注の線・画像の代わりの枠
  { id: "markdown-link", fallback: "accent" },
  { id: "markdown-code-fill", fallback: "surface" }, // コードの塊の地
  { id: "markdown-inline-code-fill", fallback: "surface" }, // 文中のコードの地
  { id: "markdown-table-stripe", value: "transparent" }, // 表の偶数の行の地
  { id: "markdown-page-padding", value: "24px 32px", shades: "one" }, // 紙の辺と文書の間（書く画面の描いた文書と、印刷の印刷区画ごと）
  { id: "markdown-font-family", value: '"Noto Sans JP", sans-serif', shades: "one" }, // 本文の字体
  { id: "markdown-font-size", value: "14px", shades: "one" },
  { id: "markdown-line-height", value: "1.7", shades: "one" },
  { id: "markdown-h1-size", value: "1.8em", shades: "one" },
  { id: "markdown-h2-size", value: "1.45em", shades: "one" },
  { id: "markdown-h3-size", value: "1.2em", shades: "one" },
  { id: "markdown-h4-size", value: "1em", shades: "one" },
  { id: "markdown-h5-size", value: "1em", shades: "one" },
  { id: "markdown-h6-size", value: "1em", shades: "one" },
  { id: "markdown-heading-weight", value: "bold", shades: "one" },
  { id: "markdown-heading-line-height", value: "1.3", shades: "one" },
  { id: "markdown-heading-gap", value: "1.4em 0 0.6em", shades: "one" }, // 見出しの上下の空き（margin）
  { id: "markdown-heading-rule-gap", value: "0.2em", shades: "one" }, // 見出し 1・2 の字と下線の間
  { id: "markdown-block-gap", value: "0.9em", shades: "one" }, // 段落・リスト・引用・コード・表の下の空き
  { id: "markdown-list-indent", value: "1.8em", shades: "one" },
  { id: "markdown-quote-width", value: "3px", shades: "one" }, // 引用の縦線の太さ
  { id: "markdown-quote-padding", value: "0 1em", shades: "one" },
  { id: "markdown-cell-padding", value: "4px 10px", shades: "one" }, // 表のセルの内側の空き
  { id: "markdown-table-head-weight", value: "bold", shades: "one" }, // 表の見出しのセルの字の太さ
  { id: "markdown-link-decoration", value: "underline", shades: "one" }, // リンクの下線（none で引かない）
  { id: "markdown-rule-width", value: "1px", shades: "one" }, // 区切り線の太さ（見出しの下線は含めない）
  { id: "markdown-rule-gap", value: "1.4em 0", shades: "one" }, // 区切り線の上下の空き（margin）
  { id: "markdown-footnote-size", value: "0.9em", shades: "one" }, // 脚注の字の大きさ
  { id: "markdown-footnote-gap", value: "2em", shades: "one" }, // 本文と脚注の間
  { id: "markdown-code-font-family", value: "ui-monospace, monospace", shades: "one" },
  { id: "markdown-code-font-size", value: "13px", shades: "one" }, // コードの塊の字の大きさ
  { id: "markdown-code-padding", value: "10px 12px", shades: "one" }, // コードの塊の内側の空き
  { id: "markdown-code-radius", value: "4px", shades: "one" }, // コードの塊と文中のコードの角の丸み
  { id: "markdown-inline-code-size", value: "0.92em", shades: "one" }, // 文中のコードの字の大きさ
  { id: "markdown-inline-code-padding", value: "0.1em 0.3em", shades: "one" },
] as const

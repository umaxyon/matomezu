// ページの外で描いた文書（MarkdownDocumentView）に当てる、スキンの値で描くための CSS 変数の組: ページのテーマが値を置かない所（コントロールセンターなど）が、文書を描く要素の style に置く。
// 色はスキンキー（--skin-text など）と、スキンの明暗ごとのコードの色（--skin-code-<種類>）から、ほかは MARKDOWN_DOCUMENT_TOKENS の既定の値で決める。使う所は、自分の見た目の上書きを重ねてよい
import type { CSSProperties } from "react"
import { CODE_COLORS } from "../../../core/color"
import { MARKDOWN_DOCUMENT_TOKENS } from "./tokens"

// 共通のテーマキー（MARKDOWN_DOCUMENT_TOKENS の fallback）に当たるスキンキー
const SKIN_KEY_OF = {
  text: "text",
  hint: "text-muted",
  line: "border",
  accent: "accent",
  surface: "surface-muted",
} as const

const CODE_COLOR_IDS = new Set(CODE_COLORS.map(kind => `markdown-code-color-${kind}`))

const ON_SKIN = Object.fromEntries(
  MARKDOWN_DOCUMENT_TOKENS.map(t => {
    const value =
      "fallback" in t
        ? `var(--skin-${SKIN_KEY_OF[t.fallback]})`
        : CODE_COLOR_IDS.has(t.id)
          ? `var(--skin-code-${t.id.slice("markdown-code-color-".length)})`
          : t.value
    return [`--${t.id}`, value]
  }),
) as CSSProperties

export const markdownDocumentOnSkin = (): CSSProperties => ON_SKIN

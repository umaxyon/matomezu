// ブックの外で描く文書に当てる、スキンの値の CSS 変数の組（base の markdownDocumentOnSkin）: 描いた文書が受けるテーマキーを全部持ち、色はスキンキーとスキンのコードの色、ほかは既定の値になる
import { expect, test } from "bun:test"
import { MARKDOWN_DOCUMENT_TOKENS } from "../../../web/src/plugins/base"
import { markdownDocumentOnSkin } from "../../../web/src/plugins/base/ui"

test("描いた文書が受けるテーマキーを全部、同じ名前の CSS 変数に持つ", () => {
  const vars = markdownDocumentOnSkin() as Record<string, string>
  expect(Object.keys(vars).sort()).toEqual(MARKDOWN_DOCUMENT_TOKENS.map(t => `--${t.id}`).sort())
})

test("色はスキンの値（字・引用の字・線・リンク・コードの地）とスキンのコードの色、ほかは既定の値", () => {
  const vars = markdownDocumentOnSkin() as Record<string, string>
  expect(vars["--markdown-text"]).toBe("var(--skin-text)")
  expect(vars["--markdown-hint"]).toBe("var(--skin-text-muted)")
  expect(vars["--markdown-line"]).toBe("var(--skin-border)")
  expect(vars["--markdown-link"]).toBe("var(--skin-accent)")
  expect(vars["--markdown-code-fill"]).toBe("var(--skin-surface-muted)")
  expect(vars["--markdown-code-color-keyword"]).toBe("var(--skin-code-keyword)")
  expect(vars["--markdown-font-size"]).toBe("14px")
  expect(Object.values(vars).every(v => v !== "")).toBe(true)
})

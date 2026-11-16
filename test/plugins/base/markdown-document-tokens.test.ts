// 描いた文書（base/markdown）が CSS で読む --markdown-… は、base が出すテーマキーの並び（MARKDOWN_DOCUMENT_TOKENS）にある物だけ。
// 並びに無い名前を読むと、ブックの外で文書を描く所が置く変数からも、マークダウンのページのタイプの宣言からも抜ける
import { expect, test } from "bun:test"
import { Glob } from "bun"
import { MARKDOWN_DOCUMENT_TOKENS } from "../../../web/src/plugins/base"

test("描いた文書の CSS とビューが読む --markdown-… は、MARKDOWN_DOCUMENT_TOKENS にある", async () => {
  const declared = new Set(MARKDOWN_DOCUMENT_TOKENS.map(t => `--${t.id}`))
  const unknown: string[] = []
  for await (const file of new Glob("web/src/plugins/base/markdown/**/*.{ts,tsx,css}").scan()) {
    const src = await Bun.file(file).text()
    // 名前を組み立てる所（var(--markdown-code-color-${…})）は見ない
    for (const [, name] of src.matchAll(/var\((--markdown-[a-z0-9-]+)(?![a-z0-9-]*\$)/g))
      if (!declared.has(name!)) unknown.push(`${file}: ${name}`)
  }
  expect(unknown).toEqual([])
})

import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { MASTER_BOOK } from "../../web/src/core/book"
import { perform } from "../../web/src/core/perform"
import { ACTIONS, BOOK_TYPES, checkRegistry, ITEMS } from "../../web/src/core/registry"
import { BookSchema } from "../../web/src/core/schema/book"
import { bookTokens, resolveTokens } from "../../web/src/core/theme"
import { SAMPLE_BOOKS } from "../../web/src/store/sample-books"

describe("登録表", () => {
  test("表どうしの参照に食い違いが無い", () => {
    expect(checkRegistry()).toEqual([])
  })

  test("ブックの形・アイテムの項目・アクションの引数は、JSON Schema に書き出せる（LLM に見せる形）", () => {
    expect(z.toJSONSchema(BookSchema)).toBeTruthy()
    for (const def of [...ITEMS.map(i => i.props), ...ACTIONS.map(a => a.args)])
      expect(z.toJSONSchema(def)).toBeTruthy()
  })

  test("ブックのデータは、そのタイプの形で検査する", () => {
    for (const t of BOOK_TYPES) expect(t.schema.shape.type.value).toBe(t.id)
    expect(BookSchema.safeParse(SAMPLE_BOOKS[0]).success).toBe(true)
    expect(BookSchema.safeParse({ type: "nope", id: "x" }).success).toBe(false)
  })
})

describe("アクションを行う", () => {
  const book = SAMPLE_BOOKS[0]!

  test("ブックで使えるアクションは、引数を確かめてから行う", () => {
    const done = perform(book, "page.add", {}, { lang: "ja" })
    expect(done.ok && "pages" in done.book && done.book.pages.map(p => p.title)).toEqual(["ページ 1", "ページ 2"])
    expect(perform(book, "page.add", { extra: 1 }, { lang: "ja" })).toEqual({ ok: false, reason: "bad-args" })
  })

  test("タイプが許していないアクションと、知らないアクションは断る", () => {
    expect(perform(MASTER_BOOK, "page.add", {}, { lang: "ja" })).toEqual({ ok: false, reason: "not-allowed" })
    expect(perform(book, "nope", {}, { lang: "ja" })).toEqual({ ok: false, reason: "unknown" })
  })
})

describe("テーマの値", () => {
  test("宣言された欄は、テーマが上書きしていなければ、宣言の既定（共通の欄）の値", () => {
    const values = resolveTokens("standard", [{ id: "box.fill", fallback: "fill" }])
    expect(values["box.fill"]).toBe(values.fill!)
  })

  test("ブックの値には、ブックで使えるアイテムの欄が入る", () => {
    expect(Object.keys(bookTokens(SAMPLE_BOOKS[0]!))).toContain("box.fill")
    expect(Object.keys(bookTokens(MASTER_BOOK))).not.toContain("box.fill")
  })
})

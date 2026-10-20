import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { MASTER_BOOK } from "../../web/src/core/book"
import { perform } from "../../web/src/core/perform"
import { ACTIONS, BOOK_TYPES, BUILTIN_PARTS, buildRegistry, checkRegistry, ITEMS } from "../../web/src/core/registry"
import { BookSchema } from "../../web/src/core/schema/book"
import { bookTokens, resolveTokens } from "../../web/src/core/theme"
import { SAMPLE_BOOKS } from "../../web/src/store/sample-books"

describe("登録表", () => {
  test("表どうしの参照に食い違いが無い", () => {
    expect(checkRegistry(BUILTIN_PARTS)).toEqual([])
  })

  test("食い違いのある定義の組からは表を作らず、直す所を並べる", () => {
    const [drawing, master] = BOOK_TYPES
    const broken = {
      ...BUILTIN_PARTS,
      bookTypes: [drawing, master, drawing],
      items: [],
      papers: BUILTIN_PARTS.papers.filter(p => p.id !== "a3"),
    }
    expect(checkRegistry(broken)).toEqual([
      "bookType drawing: id is registered twice",
      "bookType drawing: unknown paper a3",
      "bookType drawing: unknown item shape.box",
      "bookType drawing: unknown paper a3",
      "bookType drawing: unknown item shape.box",
    ])
    expect(() => buildRegistry(broken)).toThrow("bookType drawing: unknown item shape.box")
    expect(() => buildRegistry({ ...BUILTIN_PARTS, bookTypes: [] })).toThrow("no book type")
  })

  test("作った表は id で引け、ブックのデータの形を持つ", () => {
    const reg = buildRegistry(BUILTIN_PARTS)
    expect(reg.bookTypes.get("drawing")).toBe(BOOK_TYPES[0])
    expect(reg.items.get("nope")).toBeUndefined()
    expect(reg.bookSchema.safeParse(SAMPLE_BOOKS[0]).success).toBe(true)
    expect(reg.bookSchema.safeParse({ type: "nope", id: "x" }).success).toBe(false)
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
  const ctx = { lang: "ja" as const, newId: () => "new" }
  const library = { [MASTER_BOOK.id]: MASTER_BOOK, [book.id]: book }

  test("ブックで使えるアクションは、引数を確かめてから行い、結果を返す", () => {
    const done = perform(book, "page.add", { title: " 表紙 ", paper: "a3", orientation: "portrait" }, ctx)
    expect(done).toMatchObject({ ok: true, result: { page: "p2" } })
    expect(done.ok && "pages" in done.next && done.next.pages.at(-1)).toEqual({
      id: "p2",
      title: "表紙",
      paper: "a3",
      orientation: "portrait",
    })
    // 紙を決めなければ、規定の既定
    const plain = perform(book, "page.add", { title: "次" }, ctx)
    expect(plain.ok && "pages" in plain.next && plain.next.pages.at(-1)).toMatchObject({
      paper: "a4",
      orientation: "landscape",
    })
  })

  test("名前が空のページとブックは断る", () => {
    expect(perform(book, "page.add", { title: "  " }, ctx)).toEqual({ ok: false, reason: "bad-args" })
    expect(perform(library, "book.create", { title: "", type: "drawing" }, ctx)).toEqual({
      ok: false,
      reason: "bad-args",
    })
  })

  test("ブックを作ると、振った id で一覧に入り、その id を返す。同じ id があれば断る", () => {
    const done = perform(library, "book.create", { title: "新しい図", type: "drawing" }, ctx)
    expect(done).toMatchObject({ ok: true, result: { book: "new" } })
    expect(done.ok && done.next.new).toEqual({ type: "drawing", id: "new", title: "新しい図", pages: [] })
    const again = done.ok ? perform(done.next, "book.create", { title: "もう一つ", type: "drawing" }, ctx) : null
    expect(again).toEqual({ ok: false, reason: "refused" })
  })

  test("ブックの一覧を変えるアクションは、マスターのタイプが許すときだけ", () => {
    expect(perform({ [book.id]: book }, "book.create", { title: "x", type: "drawing" }, ctx)).toEqual({
      ok: false,
      reason: "not-allowed",
    })
  })

  test("タイプが許していないアクションと、知らないアクションは断る", () => {
    expect(perform(MASTER_BOOK, "page.add", { title: "x" }, ctx)).toEqual({ ok: false, reason: "not-allowed" })
    // @ts-expect-error 知らない id は型でも誤り
    expect(perform(book, "nope", {}, ctx)).toEqual({ ok: false, reason: "unknown" })
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

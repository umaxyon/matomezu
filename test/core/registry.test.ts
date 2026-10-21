import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { defineBookType } from "../../web/src/core/def/book-type"
import { ERRORS, isMatomezuError, problemText } from "../../web/src/core/errors"
import { translate } from "../../web/src/core/i18n/i18n"
import { defineLanguagePack } from "../../web/src/core/i18n/messages"
import { NO_KEY_CHANGES } from "../../web/src/core/keys"
import { perform } from "../../web/src/core/perform"
import { buildRegistry, checkRegistry } from "../../web/src/core/registry"
import { bookTokens, resolveTokens } from "../../web/src/core/theme"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"
import { BUILTIN_PARTS, REGISTRY } from "../support"

describe("登録表", () => {
  test("表どうしの参照に食い違いが無い", () => {
    expect(checkRegistry(BUILTIN_PARTS)).toEqual([])
  })

  test("食い違いのある定義の組からは表を作らず、直す所を並べる", () => {
    const drawing = BUILTIN_PARTS.bookTypes.find(t => t.id === "drawing")!
    const master = BUILTIN_PARTS.bookTypes.find(t => t.id === "master")!
    const broken = {
      ...BUILTIN_PARTS,
      bookTypes: [drawing, master, drawing],
      items: [],
      papers: BUILTIN_PARTS.papers.filter(p => p.id !== "a3"),
    }
    const problems = checkRegistry(broken)
    expect(problems.map(p => p.code)).toEqual(["E001", "E004", "E008", "E004", "E008"])
    expect(problems.map(problemText).slice(0, 3)).toEqual([
      "E001 bookType drawing: id is registered twice",
      "E004 bookType drawing: unknown paper a3",
      "E008 bookType drawing: unknown item shape.box",
    ])
    const thrown = (() => {
      try {
        buildRegistry(broken)
      } catch (e) {
        return e
      }
    })()
    expect(isMatomezuError(thrown) && thrown.code).toBe("E016")
    expect(isMatomezuError(thrown) && thrown.details).toEqual(problems)
    expect(String(thrown)).toContain("E008 bookType drawing: unknown item shape.box")
    expect(() => buildRegistry({ ...BUILTIN_PARTS, bookTypes: [] })).toThrow("E015 registry has no book type")
  })

  test("同じ鍵の同じ言語に違う訳を持つ文言と、文言の表に無い名前は誤り", () => {
    const conflict = { ...BUILTIN_PARTS, messages: [...BUILTIN_PARTS.messages, { Master: { ja: "親分" } }] }
    expect(checkRegistry(conflict).map(problemText)).toEqual(["E017 message Master has different ja translations"])
    // 同じ訳と、ほかの言語の訳を足すのはよい
    const more = {
      ...BUILTIN_PARTS,
      messages: [...BUILTIN_PARTS.messages, { Master: { ja: "マスター", fr: "Maître" } }],
    }
    expect(checkRegistry(more)).toEqual([])
    const untitled = { ...BUILTIN_PARTS, messages: [] }
    expect(checkRegistry(untitled).map(p => p.code)).toContain("E018")
  })

  test("言語パックは言語を足し、どのプラグインの文言にも訳を足す。パックの訳がプラグインの訳に勝つ", () => {
    const fr = defineLanguagePack({ lang: "fr", name: "Français", messages: { Master: "Maître", Box: "Boîte" } })
    const jaFix = defineLanguagePack({ lang: "ja", name: "日本語", messages: { Master: "親分" } })
    const reg = buildRegistry({ ...BUILTIN_PARTS, languages: [fr, jaFix] })
    expect([...reg.languages]).toEqual([
      ["en", "English"],
      ["ja", "日本語"],
      ["fr", "Français"],
    ])
    expect(translate(reg.messages, "fr", "Box")).toBe("Boîte")
    expect(translate(reg.messages, "fr", "Add page")).toBe("Add page")
    expect(translate(reg.messages, "ja", "Master")).toBe("親分")
    // app に無い鍵の訳は使わない
    const stray = defineLanguagePack({ lang: "fr", name: "Français", messages: { ["Nope" as "Box"]: "Non" } })
    expect(buildRegistry({ ...BUILTIN_PARTS, languages: [stray] }).messages.has("Nope")).toBe(false)
  })

  test("名前の違う同じ言語と、パックどうしで違う訳は誤り", () => {
    const a = defineLanguagePack({ lang: "fr", name: "Français", messages: { Box: "Boîte" } })
    const b = defineLanguagePack({ lang: "fr", name: "French", messages: { Box: "Caisse" } })
    expect(checkRegistry({ ...BUILTIN_PARTS, languages: [a, b] }).map(problemText)).toEqual([
      "E020 language fr has different names",
      "E021 language packs give message Box different fr translations",
    ])
  })

  test("作った表は id で引け、ブックのデータの形を持つ", () => {
    const reg = buildRegistry(BUILTIN_PARTS)
    expect(reg.bookTypes.get("drawing")).toBe(BUILTIN_PARTS.bookTypes.find(t => t.id === "drawing"))
    expect(reg.items.get("nope")).toBeUndefined()
    expect(reg.bookSchema.safeParse(SAMPLE_BOOKS[0]).success).toBe(true)
    expect(reg.bookSchema.safeParse({ type: "nope", id: "x" }).success).toBe(false)
  })

  test("ブックの形・アイテムの項目・アクションの引数は、JSON Schema に書き出せる（LLM に見せる形）", () => {
    expect(z.toJSONSchema(REGISTRY.bookSchema)).toBeTruthy()
    for (const def of [...BUILTIN_PARTS.items.map(i => i.props), ...BUILTIN_PARTS.actions.map(a => a.args)])
      expect(z.toJSONSchema(def)).toBeTruthy()
  })

  test("ブックのデータは、そのタイプの形で検査する", () => {
    for (const t of BUILTIN_PARTS.bookTypes) expect(t.schema.shape.type.value).toBe(t.id)
    expect(REGISTRY.bookSchema.safeParse(SAMPLE_BOOKS[0]).success).toBe(true)
    expect(REGISTRY.bookSchema.safeParse({ type: "nope", id: "x" }).success).toBe(false)
  })
})

describe("アクションを行う", () => {
  const book = SAMPLE_BOOKS[0]!
  const ctx = { registry: REGISTRY, home: "master", lang: "ja" as const, newId: () => "new" }
  const library = { [MASTER_BOOK.id]: MASTER_BOOK, [book.id]: book }

  test("ブックで使えるアクションは、引数を確かめてから行い、結果を返す", () => {
    const done = perform(book, "page.add", { title: " 表紙 ", paper: "a3", orientation: "portrait" }, ctx)
    expect(done).toMatchObject({ ok: true, result: { page: "new" } })
    expect(done.ok && "pages" in done.next && done.next.pages.at(-1)).toEqual({
      id: "new",
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

  test("ブックの一覧と設定を変えるアクションは、ホームのタイプが許すときだけ。ホームが無ければ断る", () => {
    const homeless = { ...ctx, home: null }
    expect(perform({ [book.id]: book }, "book.create", { title: "x", type: "drawing" }, homeless)).toEqual({
      ok: false,
      reason: "not-allowed",
    })
    const settings = { lang: "ja", skin: "auto", keys: NO_KEY_CHANGES }
    expect(perform(settings, "settings.lang", { lang: "en" }, ctx)).toMatchObject({ ok: true, next: { lang: "en" } })
    expect(perform(settings, "settings.lang", { lang: "en" }, homeless)).toEqual({ ok: false, reason: "not-allowed" })
    // app に無い言語は断る
    expect(perform(settings, "settings.lang", { lang: "fr" }, ctx)).toEqual({ ok: false, reason: "refused" })
  })

  test("タイプが許していないアクションと、知らないアクションは断る", () => {
    expect(perform(MASTER_BOOK, "page.add", { title: "x" }, ctx)).toEqual({ ok: false, reason: "not-allowed" })
    // @ts-expect-error 知らない id は型でも誤り
    expect(perform(book, "nope", {}, ctx)).toEqual({ ok: false, reason: "unknown" })
  })
})

describe("テーマの値", () => {
  test("宣言された欄は、テーマが上書きしていなければ、宣言の既定（共通の欄）の値", () => {
    const values = resolveTokens(REGISTRY, "standard", [{ id: "box.fill", fallback: "fill" }])
    expect(values["box.fill"]).toEqual(values.fill!)
  })

  test("ブックの値には、ブックで使えるアイテムの欄が入る", () => {
    expect(Object.keys(bookTokens(REGISTRY, SAMPLE_BOOKS[0]!))).toContain("box.fill")
    expect(Object.keys(bookTokens(REGISTRY, MASTER_BOOK))).not.toContain("box.fill")
  })
})

describe("誤りの表", () => {
  test("番号は E と 3 桁で、どの番号もソースのどこかで使う", () => {
    const dir = join(import.meta.dir, "../../web/src")
    const files = (readdirSync(dir, { recursive: true }) as string[]).filter(
      f => /\.tsx?$/.test(f) && !f.endsWith("errors.ts"),
    )
    const text = files.map(f => readFileSync(join(dir, f), "utf8")).join("\n")
    for (const code of Object.keys(ERRORS)) {
      expect(code).toMatch(/^E\d{3}$/)
      expect(text.includes(`"${code}"`)).toBe(true)
    }
  })
})

describe("登録表ごとに別の世界", () => {
  const NOTES = defineBookType({
    id: "notes",
    version: 1,
    title: "Drawing",
    schema: z.strictObject({ type: z.literal("notes"), id: z.string().min(1), title: z.string() }),
    single: false,
    create: init => ({ type: "notes" as const, ...init }),
    pages: null,
    items: { allowed: [], defaults: [] },
    actions: { allowed: [], defaults: [] },
    theme: "standard",
    tokens: [],
  })
  const reg = buildRegistry({ ...BUILTIN_PARTS, bookTypes: [...BUILTIN_PARTS.bookTypes, NOTES] })
  const library = { [MASTER_BOOK.id]: MASTER_BOOK }

  test("足したタイプのブックは、それを持つ表でだけ作れて、データの形もその表で通る", () => {
    const made = perform(
      library,
      "book.create",
      { title: "メモ", type: "notes" },
      { registry: reg, home: "master", lang: "ja", newId: () => "n1" },
    )
    expect(made).toMatchObject({ ok: true, result: { book: "n1" } })
    expect(made.ok && reg.bookSchema.safeParse(made.next.n1).success).toBe(true)
    expect(REGISTRY.bookSchema.safeParse({ type: "notes", id: "n1", title: "メモ" }).success).toBe(false)
    const refused = perform(
      library,
      "book.create",
      { title: "メモ", type: "notes" },
      { registry: REGISTRY, home: "master", lang: "ja", newId: () => "n1" },
    )
    expect(refused).toEqual({ ok: false, reason: "refused" })
  })
})

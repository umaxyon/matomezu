import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { buildCoreCatalog, checkCoreCatalog } from "../../web/src/core/core-catalog"
import { defineBookType } from "../../web/src/core/def/book-type"
import { ERRORS, isMatomezuError, problemText } from "../../web/src/core/errors"
import { translate } from "../../web/src/core/i18n/i18n"
import { defineLanguagePack } from "../../web/src/core/i18n/messages"
import { NO_KEY_CHANGES } from "../../web/src/core/keys"
import { perform } from "../../web/src/core/perform"
import { resolveTokens, tokenDeclsOf } from "../../web/src/core/theme"
import { bookTokens } from "../../web/src/plugins/base/book-look/look"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"
import { BUILTIN_PARTS, CORE_CATALOG } from "../support"

describe("機能台帳", () => {
  test("ビルトインプラグインのテーマが上書きするテーマキーは、どれもビルトインプラグインのアイテム・タイプ・プラグインが宣言している（インスタンスに無いアイテムのテーマキーの上書きは誤りにせず、使わないだけ）", () => {
    const declared = new Set(
      [...[...BUILTIN_PARTS.bookTypes, ...BUILTIN_PARTS.items].flatMap(d => d.tokens), ...BUILTIN_PARTS.tokens].map(
        k => k.id,
      ),
    )
    const unknown = BUILTIN_PARTS.themes.flatMap(th => Object.keys(th.tokens ?? {}).filter(id => !declared.has(id)))
    expect(unknown).toEqual([])
  })

  test("表どうしの参照に食い違いが無い", () => {
    expect(checkCoreCatalog(BUILTIN_PARTS)).toEqual([])
  })

  test("食い違いのある定義の組からは表を作らず、直す所を並べる", () => {
    const drawing = BUILTIN_PARTS.bookTypes.find(t => t.id === "@matomezu/drawing:drawing")!
    const master = BUILTIN_PARTS.bookTypes.find(t => t.id === "@matomezu/master:master")!
    const broken = {
      ...BUILTIN_PARTS,
      bookTypes: [drawing, master, drawing],
      items: [],
      themes: BUILTIN_PARTS.themes.filter(th => !th.tokens), // 外したアイテムの欄を上書きするテーマも外す
      papers: BUILTIN_PARTS.papers.filter(p => p.id !== "@matomezu/base:a3"),
    }
    const problems = checkCoreCatalog(broken)
    // 図面は置けるアイテムが全部無いので、その数だけ E008（同じタイプが 2 つあるので 2 回）
    const drawingProblems = ["E004" as const, ...Array.from(drawing.items.allowed, () => "E008" as const)]
    expect(problems.map(p => p.code)).toEqual(["E001", ...drawingProblems, ...drawingProblems])
    expect(problems.map(problemText).slice(0, 3)).toEqual([
      "E001 bookType @matomezu/drawing:drawing: id is registered twice",
      "E004 bookType @matomezu/drawing:drawing: unknown paper @matomezu/base:a3",
      "E008 bookType @matomezu/drawing:drawing: unknown item @matomezu/box:shape-box",
    ])
    const thrown = (() => {
      try {
        buildCoreCatalog(broken)
      } catch (e) {
        return e
      }
    })()
    expect(isMatomezuError(thrown) && thrown.code).toBe("E016")
    expect(isMatomezuError(thrown) && thrown.details).toEqual(problems)
    expect(String(thrown)).toContain("E008 bookType @matomezu/drawing:drawing: unknown item @matomezu/box:shape-box")
    expect(() => buildCoreCatalog({ ...BUILTIN_PARTS, bookTypes: [] })).toThrow("E015 core catalog has no book type")
  })

  test("同じ鍵の同じ言語に違う訳を持つ文言と、文言の表に無い名前は誤り", () => {
    const conflict = {
      ...BUILTIN_PARTS,
      messages: [...BUILTIN_PARTS.messages, { "@matomezu/master:Master": { en: "Master", ja: "親分" } }],
    }
    expect(checkCoreCatalog(conflict).map(problemText)).toEqual([
      "E017 message @matomezu/master:Master has different ja translations",
    ])
    // 同じ訳と、ほかの言語の訳を足すのはよい
    const more = {
      ...BUILTIN_PARTS,
      messages: [...BUILTIN_PARTS.messages, { Master: { ja: "マスター", fr: "Maître" } }],
    }
    expect(checkCoreCatalog(more)).toEqual([])
    const untitled = { ...BUILTIN_PARTS, messages: [] }
    expect(checkCoreCatalog(untitled).map(p => p.code)).toContain("E018")
  })

  test("言語パックは言語を足し、どのプラグインの文言にも訳を足す。パックの訳がプラグインの訳に勝つ", () => {
    const fr = defineLanguagePack({
      lang: "fr",
      name: "Français",
      messages: { "@matomezu/master:Master": "Maître", "@matomezu/box:Box": "Boîte" },
    })
    const jaFix = defineLanguagePack({ lang: "ja", name: "日本語", messages: { "@matomezu/master:Master": "親分" } })
    const catalog = buildCoreCatalog({ ...BUILTIN_PARTS, languages: [fr, jaFix] })
    expect([...catalog.languages]).toEqual([
      ["en", "English"],
      ["ja", "日本語"],
      ["fr", "Français"],
    ])
    expect(translate(catalog.messages, "fr", "@matomezu/box:Box")).toBe("Boîte")
    expect(translate(catalog.messages, "fr", "Add page")).toBe("Add page")
    expect(translate(catalog.messages, "ja", "@matomezu/master:Master")).toBe("親分")
    // インスタンスに無い鍵の訳は使わない
    const stray = defineLanguagePack({
      lang: "fr",
      name: "Français",
      messages: { ["Nope" as "@matomezu/box:Box"]: "Non" },
    })
    expect(buildCoreCatalog({ ...BUILTIN_PARTS, languages: [stray] }).messages.has("Nope")).toBe(false)
  })

  test("名前の違う同じ言語と、パックどうしで違う訳は誤り", () => {
    const a = defineLanguagePack({ lang: "fr", name: "Français", messages: { "@matomezu/box:Box": "Boîte" } })
    const b = defineLanguagePack({ lang: "fr", name: "French", messages: { "@matomezu/box:Box": "Caisse" } })
    expect(checkCoreCatalog({ ...BUILTIN_PARTS, languages: [a, b] }).map(problemText)).toEqual([
      "E020 language fr has different names",
      "E021 language packs give message @matomezu/box:Box different fr translations",
    ])
  })

  test("作った表は id で引け、ブックのデータの形を持つ", () => {
    const catalog = buildCoreCatalog(BUILTIN_PARTS)
    expect(catalog.bookTypes.get("@matomezu/drawing:drawing")).toBe(
      BUILTIN_PARTS.bookTypes.find(t => t.id === "@matomezu/drawing:drawing"),
    )
    expect(catalog.items.get("nope")).toBeUndefined()
    expect(catalog.bookSchema.safeParse(SAMPLE_BOOKS[0]).success).toBe(true)
    expect(catalog.bookSchema.safeParse({ type: "nope", id: "x" }).success).toBe(false)
  })

  test("ブックの形・アイテムの項目・アクションの引数は、JSON Schema に書き出せる（LLM に見せる形）", () => {
    expect(z.toJSONSchema(CORE_CATALOG.bookSchema)).toBeTruthy()
    const shown = BUILTIN_PARTS.actions.map(a => a.describeArgs?.(CORE_CATALOG) ?? a.args) // AI 向けの機能台帳と同じ形
    for (const def of [...BUILTIN_PARTS.items.map(i => i.props), ...shown]) expect(z.toJSONSchema(def)).toBeTruthy()
  })

  test("ブックのデータは、そのタイプの形で検査する", () => {
    for (const t of BUILTIN_PARTS.bookTypes) expect(t.schema.shape.type.value).toBe(t.id)
    expect(CORE_CATALOG.bookSchema.safeParse(SAMPLE_BOOKS[0]).success).toBe(true)
    expect(CORE_CATALOG.bookSchema.safeParse({ type: "nope", id: "x" }).success).toBe(false)
  })
})

describe("アクションを行う", () => {
  const book = SAMPLE_BOOKS[0]!
  const ctx = {
    catalog: CORE_CATALOG,
    home: "@matomezu/master:master",
    lang: "ja" as const,
    newId: () => "new",
    now: "2026-10-26T00:00:00.000Z",
  }
  const library = { [MASTER_BOOK.id]: MASTER_BOOK, [book.id]: book }

  test("ブックで使えるアクションは、引数を確かめてから行い、結果を返す", () => {
    const done = perform(
      book,
      "@matomezu/base:page-add",
      { title: " 表紙 ", paper: "@matomezu/base:a3", orientation: "portrait" },
      ctx,
    )
    expect(done).toMatchObject({ ok: true, result: { page: "new" } })
    expect(done.ok && "pages" in done.next && done.next.pages.at(-1)).toEqual({
      id: "new",
      title: "表紙",
      paper: "@matomezu/base:a3",
      orientation: "portrait",
    })
    // 紙を決めなければ、規定の既定
    const plain = perform(book, "@matomezu/base:page-add", { title: "次" }, ctx)
    expect(plain.ok && "pages" in plain.next && plain.next.pages.at(-1)).toMatchObject({
      paper: "@matomezu/base:a4",
      orientation: "landscape",
    })
  })

  test("名前が空のページとブックは断る", () => {
    expect(perform(book, "@matomezu/base:page-add", { title: "  " }, ctx)).toEqual({ ok: false, reason: "bad-args" })
    expect(
      perform(library, "@matomezu/base:book-create", { title: "", type: "@matomezu/drawing:drawing" }, ctx),
    ).toEqual({
      ok: false,
      reason: "bad-args",
    })
  })

  test("ブックを作ると、振った id で一覧に入り、その id を返す。同じ id があれば断る", () => {
    const done = perform(
      library,
      "@matomezu/base:book-create",
      { title: "新しい図", type: "@matomezu/drawing:drawing" },
      ctx,
    )
    expect(done).toMatchObject({ ok: true, result: { book: "new" } })
    expect(done.ok && done.next.new).toEqual({
      type: "@matomezu/drawing:drawing",
      id: "new",
      title: "新しい図",
      pages: [],
    })
    const again = done.ok
      ? perform(done.next, "@matomezu/base:book-create", { title: "もう一つ", type: "@matomezu/drawing:drawing" }, ctx)
      : null
    expect(again).toEqual({ ok: false, reason: "refused" })
  })

  test("ブックの一覧と設定を変えるアクションは、ホームのタイプが許すときだけ。ホームが無ければ断る", () => {
    const homeless = { ...ctx, home: null }
    expect(
      perform(
        { [book.id]: book },
        "@matomezu/base:book-create",
        { title: "x", type: "@matomezu/drawing:drawing" },
        homeless,
      ),
    ).toEqual({
      ok: false,
      reason: "not-allowed",
    })
    const settings = { lang: "ja", skin: "auto", keys: NO_KEY_CHANGES }
    expect(perform(settings, "@matomezu/base:settings-lang", { lang: "en" }, ctx)).toMatchObject({
      ok: true,
      next: { lang: "en" },
    })
    expect(perform(settings, "@matomezu/base:settings-lang", { lang: "en" }, homeless)).toEqual({
      ok: false,
      reason: "not-allowed",
    })
    // インスタンスに無い言語は断る
    expect(perform(settings, "@matomezu/base:settings-lang", { lang: "fr" }, ctx)).toEqual({
      ok: false,
      reason: "refused",
    })
  })

  test("タイプが許していないアクションと、知らないアクションは断る", () => {
    expect(perform(MASTER_BOOK, "@matomezu/base:page-add", { title: "x" }, ctx)).toEqual({
      ok: false,
      reason: "not-allowed",
    })
    // @ts-expect-error 知らない id は型でも誤り
    expect(perform(book, "nope", {}, ctx)).toEqual({ ok: false, reason: "unknown" })
  })
})

describe("テーマの値", () => {
  test("宣言された欄は、テーマが上書きしていなければ、宣言の既定（共通の欄）の値", () => {
    const values = resolveTokens(CORE_CATALOG, "@matomezu/base:standard", [
      { id: "@matomezu/box:box-fill", fallback: "fill" },
    ])
    expect(values["@matomezu/box:box-fill"]).toEqual(values.fill!)
  })

  test("ブックの値には、ブックで使えるアイテムの欄が入る", () => {
    expect(Object.keys(bookTokens(CORE_CATALOG, SAMPLE_BOOKS[0]!))).toContain("@matomezu/box:box-fill")
    expect(Object.keys(bookTokens(CORE_CATALOG, MASTER_BOOK))).not.toContain("@matomezu/box:box-fill")
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

describe("機能台帳ごとに別の世界", () => {
  const NOTES = defineBookType({
    id: "notes",
    version: 1,
    title: "@matomezu/drawing:Drawing",
    schema: z.strictObject({ type: z.literal("notes"), id: z.string().min(1) }),
    single: false,
    create: init => ({ type: "notes" as const, ...init }),
    pages: null,
    items: { allowed: [], defaults: [] },
    actions: {},
    theme: "@matomezu/base:standard",
    presentation: "@matomezu/master:master", // 画面に出さないので、見せ方は表にあるものを借りる
    tokens: [],
  })
  const catalog = buildCoreCatalog({ ...BUILTIN_PARTS, bookTypes: [...BUILTIN_PARTS.bookTypes, NOTES] })
  const library = { [MASTER_BOOK.id]: MASTER_BOOK }

  test("足したタイプのブックは、それを持つ表でだけ作れて、データの形もその表で通る", () => {
    const made = perform(
      library,
      "@matomezu/base:book-create",
      { title: "メモ", type: "notes" as never },
      {
        catalog: catalog,
        home: "@matomezu/master:master",
        lang: "ja",
        newId: () => "n1",
        now: "2026-10-26T00:00:00.000Z",
      },
    )
    expect(made).toMatchObject({ ok: true, result: { book: "n1" } })
    expect(made.ok && catalog.bookSchema.safeParse(made.next.n1).success).toBe(true)
    expect(CORE_CATALOG.bookSchema.safeParse({ type: "notes", id: "n1", title: "メモ" }).success).toBe(false)
    const refused = perform(
      library,
      "@matomezu/base:book-create",
      { title: "メモ", type: "notes" as never },
      {
        catalog: CORE_CATALOG,
        home: "@matomezu/master:master",
        lang: "ja",
        newId: () => "n1",
        now: "2026-10-26T00:00:00.000Z",
      },
    )
    expect(refused).toEqual({ ok: false, reason: "refused" })
  })
})

test("ブックのタイプのテーマキーは、データに置けるアイテム（allowed）のテーマキーと、その持ち主のプラグインが持つテーマキーを含む", () => {
  const base = CORE_CATALOG.bookTypes.get("@matomezu/drawing:drawing")!
  // 形をデータに置けるが、道具箱には出さない（defaults に無い）タイプ。形のテーマキーはプラグインが持つ
  const drawing = {
    ...base,
    items: { ...base.items, allowed: [...base.items.allowed, "@matomezu/shape:shape-rounded"] },
  }
  const ids = tokenDeclsOf(CORE_CATALOG, drawing).map(d => d.id)
  expect(ids).toContain("@matomezu/shape:shape-fill")
  expect(ids).toContain("@matomezu/box:box-fill")
  expect(new Set(ids).size).toBe(ids.length)
})

test("プラグインが持つテーマキーを、アイテムでも宣言したら E011", () => {
  const box = BUILTIN_PARTS.items.find(i => i.id === "@matomezu/box:shape-box")!
  const twice = { ...BUILTIN_PARTS, tokens: [...BUILTIN_PARTS.tokens, box.tokens[0]!] }
  expect(checkCoreCatalog(twice).map(p => p.code)).toEqual(["E011"])
})

test("タイプが allowed に無いアイテムへ指定を渡したら E029", () => {
  const flowchart = BUILTIN_PARTS.bookTypes.find(t => t.id === "@matomezu/flowchart:flowchart")!
  const without = flowchart.items.allowed.filter(id => id !== "@matomezu/line:connector-line")
  const bad = { ...flowchart, items: { ...flowchart.items, allowed: without, defaults: without } }
  const parts = { ...BUILTIN_PARTS, bookTypes: BUILTIN_PARTS.bookTypes.map(t => (t === flowchart ? bad : t)) }
  expect(checkCoreCatalog(parts).map(p => p.code)).toEqual(["E029"])
})

test("タイプがページに足す欄（pages.fields）は、そのタイプのページの形に入る。土台のページの欄と同じ名前なら E030", () => {
  const tree = BUILTIN_PARTS.bookTypes.find(t => t.id === "@matomezu/tree:tree")!
  const pages = tree.pages!
  const withRoot = { ...tree, pages: { ...pages, fields: { root: z.strictObject({ caption: z.string() }) } } }
  const parts = { ...BUILTIN_PARTS, bookTypes: BUILTIN_PARTS.bookTypes.map(t => (t === tree ? withRoot : t)) }
  expect(checkCoreCatalog(parts)).toEqual([])
  const page = buildCoreCatalog(parts).schemas.get(tree.id)!.page!
  const base = { id: "p1", title: "p", paper: "@matomezu/base:a4", orientation: "landscape" }
  expect(page.safeParse({ ...base, root: { caption: "根" } }).success).toBe(true)
  expect(page.safeParse(base).success).toBe(false)
  const clash = { ...tree, pages: { ...pages, fields: { title: z.string(), items: z.array(z.unknown()) } } }
  const bad = { ...BUILTIN_PARTS, bookTypes: BUILTIN_PARTS.bookTypes.map(t => (t === tree ? clash : t)) }
  expect(checkCoreCatalog(bad).map(p => [p.code, p.params.field])).toEqual([
    ["E030", "title"],
    ["E030", "items"],
  ])
})

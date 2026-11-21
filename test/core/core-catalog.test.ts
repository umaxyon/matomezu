import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { USER } from "../../web/src/core/actor"
import { pagesOf } from "../../web/src/core/book"
import { buildCoreCatalog } from "../../web/src/core/core-catalog"
import { checkCoreCatalog } from "../../web/src/core/core-catalog-check"
import { definePageType } from "../../web/src/core/def/page-type"
import { ERRORS, problemText } from "../../web/src/core/errors"
import { bookOf, tablesOf } from "../../web/src/core/folders-books"
import { translate } from "../../web/src/core/i18n/i18n"
import type { LanguagePackDef } from "../../web/src/core/i18n/messages"
import { perform } from "../../web/src/core/perform"
import { BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { pageTokens, tokenDefsOf } from "../../web/src/plugins/base/book-look/look"
import { resolveTokens } from "../../web/src/plugins/base/book-look/tokens"
import { DRAWING, drawingPage, testBook } from "../lineup"
import { SAMPLE_BOOKS } from "../sample-books"
import { BUILTIN_PARTS, CORE_CATALOG, NAMING } from "../support"

describe("機能台帳", () => {
  test("ビルトインプラグインのテーマが上書きするテーマキーは、どれもビルトインプラグインのアイテム・タイプ・プラグインが宣言している（インスタンスに無いアイテムのテーマキーの上書きは error にせず、使わないだけ）", () => {
    const declared = new Set(
      [...[...BUILTIN_PARTS.pageTypes, ...BUILTIN_PARTS.items].flatMap(d => d.tokens), ...BUILTIN_PARTS.tokens].map(
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
    const drawing = BUILTIN_PARTS.pageTypes.find(t => t.id === "@matomezu/drawing:drawing")!
    const broken = {
      ...BUILTIN_PARTS,
      pageTypes: [drawing, drawing],
      items: [],
      themes: BUILTIN_PARTS.themes.filter(th => !th.tokens), // 外したアイテムのテーマキーを上書きするテーマも外す
      papers: BUILTIN_PARTS.papers.filter(p => p.id !== "@matomezu/base:a3"),
    }
    const problems = checkCoreCatalog(broken)
    // 図面は置けるアイテム（items と背景の slide）が全部無いので、その数だけ E008（同じタイプが 2 つあるので 2 回）
    const placeable = [...drawing.items.allowed, ...(drawing.slide?.allowed ?? [])]
    const drawingProblems = ["E004" as const, ...placeable.map(() => "E008" as const)]
    expect(problems.map(p => p.code)).toEqual(["E001", ...drawingProblems, ...drawingProblems])
    expect(problems.map(problemText).slice(0, 3)).toEqual([
      "E001 pageType @matomezu/drawing:drawing: id is registered twice",
      "E004 pageType @matomezu/drawing:drawing: unknown paper @matomezu/base:a3",
      "E008 pageType @matomezu/drawing:drawing: unknown item @matomezu/box:shape-nest-box",
    ])
    const thrown = (() => {
      try {
        buildCoreCatalog(broken)
      } catch (e) {
        return e
      }
    })()
    expect(thrown).toMatchObject({ name: "MatomezuError", code: "E016", details: problems })
    expect(String(thrown)).toContain(
      "E008 pageType @matomezu/drawing:drawing: unknown item @matomezu/box:shape-nest-box",
    )
    expect(() => buildCoreCatalog({ ...BUILTIN_PARTS, pageTypes: [] })).toThrow("E015 core catalog has no page type")
  })

  test("どれかの言語で名前が同じになるシステムフォルダの定義が 2 つ在れば error（英語で違っても、日本語で同じなら）", () => {
    const docs = BUILTIN_PARTS.systemFolders[0]!
    const twin = (title: string) => ({
      ...BUILTIN_PARTS,
      messages: [
        ...BUILTIN_PARTS.messages,
        { id: "test:messages", messages: { "test:Papers": { en: "Papers", ja: title } } },
      ],
      systemFolders: [...BUILTIN_PARTS.systemFolders, { ...docs, id: "test:papers", title: "test:Papers" as never }],
    })
    expect(checkCoreCatalog(twin("書類"))).toEqual([])
    expect(checkCoreCatalog(twin("ドキュメント")).map(problemText)).toEqual([
      `E132 system folders ${docs.id} and test:papers have the same title ドキュメント in ja`,
    ])
  })

  test("同じ鍵の同じ言語に違う訳を持つ文言と、文言の表に無い名前は error", () => {
    const conflict = {
      ...BUILTIN_PARTS,
      messages: [
        ...BUILTIN_PARTS.messages,
        { id: "test:messages", messages: { "@matomezu/drawing:Drawing": { en: "Drawing", ja: "親分" } } },
      ],
    }
    expect(checkCoreCatalog(conflict).map(problemText)).toEqual([
      "E017 message @matomezu/drawing:Drawing has different ja translations",
    ])
    // 同じ訳と、ほかの言語の訳を足すのはよい
    const more = {
      ...BUILTIN_PARTS,
      messages: [
        ...BUILTIN_PARTS.messages,
        { id: "test:messages", messages: { "@matomezu/drawing:Drawing": { ja: "図面", fr: "Dessin" } } },
      ],
    }
    expect(checkCoreCatalog(more)).toEqual([])
    const untitled = { ...BUILTIN_PARTS, messages: [] }
    expect(checkCoreCatalog(untitled).map(p => p.code)).toContain("E018")
    // 題名を持つどの種類の定義も見る（アノテーションの種類も）
    const note = BUILTIN_PARTS.annotations[0]!
    const nameless = {
      ...BUILTIN_PARTS,
      annotations: [...BUILTIN_PARTS.annotations, { ...note, id: "test:sticky", title: "無い名前" as never }],
    }
    expect(checkCoreCatalog(nameless).map(problemText)).toEqual([
      "E018 annotation test:sticky: title 無い名前 is not in the messages",
    ])
  })

  test("言語パックは言語を足し、どのプラグインの文言にも訳を足す。パックの訳がプラグインの訳に勝つ", () => {
    const fr: LanguagePackDef = {
      id: "test:fr",
      lang: "fr",
      name: "Français",
      messages: { "@matomezu/drawing:Drawing": "Dessin", "@matomezu/box:Box": "Boîte" },
    }
    const jaFix: LanguagePackDef = {
      id: "test:ja",
      lang: "ja",
      name: "日本語",
      messages: { "@matomezu/drawing:Drawing": "親分" },
    }
    const catalog = buildCoreCatalog({ ...BUILTIN_PARTS, languages: [fr, jaFix] })
    expect([...catalog.languages]).toEqual([
      ["en", "English"],
      ["ja", "日本語"],
      ["fr", "Français"],
    ])
    expect(translate(catalog.messages, "fr", "@matomezu/box:Box")).toBe("Boîte")
    expect(translate(catalog.messages, "fr", "An edit could not be saved")).toBe("An edit could not be saved")
    expect(translate(catalog.messages, "ja", "@matomezu/drawing:Drawing")).toBe("親分")
    // インスタンスに無い鍵の訳は使わない
    const stray: LanguagePackDef = {
      id: "test:fr",
      lang: "fr",
      name: "Français",
      messages: { ["Nope" as "@matomezu/box:Box"]: "Non" },
    }
    expect(buildCoreCatalog({ ...BUILTIN_PARTS, languages: [stray] }).messages.has("Nope")).toBe(false)
  })

  test("文言の組・言語パック・テーマキーは id で機能台帳に並ぶ（土台の物の頭は matomezu）。同じ id は error", () => {
    const catalog = buildCoreCatalog(BUILTIN_PARTS)
    expect(catalog.messageSets.has("matomezu:messages")).toBe(true)
    expect(catalog.messageSets.has("@matomezu/base:messages")).toBe(true)
    expect([...catalog.languagePacks.keys()].slice(0, 2)).toEqual(["matomezu:en", "matomezu:ja"])
    expect([...catalog.tokens.values()].every(t => catalog.tokens.get(t.id) === t)).toBe(true)
    const fr: LanguagePackDef = { id: "a:fr", lang: "fr", name: "Français", messages: {} }
    expect(checkCoreCatalog({ ...BUILTIN_PARTS, languages: [fr, fr] }).map(problemText)).toEqual([
      "E001 language a:fr: id is registered twice",
    ])
  })

  test("名前の違う同じ言語と、パックどうしで違う訳は error", () => {
    const a: LanguagePackDef = { id: "a:fr", lang: "fr", name: "Français", messages: { "@matomezu/box:Box": "Boîte" } }
    const b: LanguagePackDef = { id: "b:fr", lang: "fr", name: "French", messages: { "@matomezu/box:Box": "Caisse" } }
    expect(checkCoreCatalog({ ...BUILTIN_PARTS, languages: [a, b] }).map(problemText)).toEqual([
      "E020 language fr has different names",
      "E021 language packs give message @matomezu/box:Box different fr translations",
    ])
  })

  test("作った表は id で引け、ブックのデータの形を持つ", () => {
    const catalog = buildCoreCatalog(BUILTIN_PARTS)
    expect(catalog.pageTypes.get("@matomezu/drawing:drawing")).toBe(
      BUILTIN_PARTS.pageTypes.find(t => t.id === "@matomezu/drawing:drawing"),
    )
    expect(catalog.items.get("nope")).toBeUndefined()
    expect(catalog.bookSchema.safeParse(SAMPLE_BOOKS[0]).success).toBe(true)
    expect(catalog.bookSchema.safeParse({ type: "nope", id: "x" }).success).toBe(false)
  })

  test("ブックの形・アイテムの項目・アクションの引数は、JSON Schema に書き出せる（LLM に見せる形）", () => {
    expect(z.toJSONSchema(CORE_CATALOG.bookSchema)).toBeTruthy()
    const shown = BUILTIN_PARTS.actions.map(a => a.describeArgs?.(CORE_CATALOG) ?? a.args) // MCP 公開ツールの actions が返す物と同じ形
    for (const def of [...BUILTIN_PARTS.items.map(i => i.props), ...shown]) expect(z.toJSONSchema(def)).toBeTruthy()
  })

  test("ページのデータは、そのページのタイプの形で検査する", () => {
    for (const t of BUILTIN_PARTS.pageTypes) expect(CORE_CATALOG.pageSchemas.get(t.id)?.shape.type.value).toBe(t.id)
    expect(CORE_CATALOG.bookSchema.safeParse(SAMPLE_BOOKS[0]).success).toBe(true)
    expect(
      CORE_CATALOG.bookSchema.safeParse({ id: "x", title: "x", lineup: [drawingPage("p1", { type: "nope" } as never)] })
        .success,
    ).toBe(false)
  })
})

describe("アクションを行う", () => {
  const book = SAMPLE_BOOKS[0]!
  const ctx = {
    catalog: CORE_CATALOG,
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "ja" as const,
    newId: () => "new",
    now: "2026-10-26T00:00:00.000Z",
    today: "2026-10-26",
    actor: USER,
    naming: NAMING,
  }
  const library = tablesOf([book])

  test("ブックで使えるアクションは、引数を確かめてから行い、結果を返す", () => {
    const done = perform(
      book,
      "@matomezu/base:page-add",
      { type: DRAWING, title: " 表紙 ", paper: "@matomezu/base:a3", orientation: "portrait" },
      ctx,
    )
    expect(done).toMatchObject({ ok: true, result: { page: "new" } })
    expect(done.ok && pagesOf(done.next).at(-1)).toEqual({
      kind: "page",
      id: "new",
      type: DRAWING,
      title: "表紙",
      paper: "@matomezu/base:a3",
      orientation: "portrait",
    })
    // 紙を決めなければ、規定の既定
    const plain = perform(book, "@matomezu/base:page-add", { type: DRAWING, title: "次" }, ctx)
    expect(plain.ok && pagesOf(plain.next).at(-1)).toMatchObject({
      paper: "@matomezu/base:a4",
      orientation: "landscape",
    })
  })

  test("名前が空のページとブックは断る", () => {
    expect(perform(book, "@matomezu/base:page-add", { type: DRAWING, title: "  " }, ctx)).toEqual({
      ok: false,
      reason: "bad-args",
    })
    expect(perform(library, "@matomezu/base:book-create", { title: "" }, ctx)).toEqual({
      ok: false,
      reason: "bad-args",
    })
  })

  test("ブックを作ると、振った id で一覧に入り、その id を返す。もう在る id は飛ばして、次の id を振る", () => {
    const done = perform(library, "@matomezu/base:book-create", { title: "新しい図" }, ctx)
    expect(done).toMatchObject({ ok: true, result: { book: "new" } })
    expect(done.ok && bookOf(done.next, "new")).toEqual({ id: "new", title: "新しい図", lineup: [] })
    const ids = ["new", "new2"]
    const next = { ...ctx, newId: () => ids.shift() ?? "none" }
    const again = done.ok ? perform(done.next, "@matomezu/base:book-create", { title: "もう一つ" }, next) : null
    expect(again).toMatchObject({ ok: true, result: { book: "new2" } })
  })

  test("ブックの一覧と設定を変えるアクションは、コントロールセンターが許すときだけ。コントロールセンターが無ければ断る", () => {
    const homeless = { ...ctx, controlCenter: null }
    expect(perform(tablesOf([book]), "@matomezu/base:book-create", { title: "x" }, homeless)).toEqual({
      ok: false,
      reason: "not-allowed",
    })
    const settings = { "@matomezu/base:lang": "matomezu:ja" }
    const lang = (pack: string) => ({ values: { "@matomezu/base:lang": pack } })
    expect(perform(settings, "@matomezu/base:settings-set", lang("matomezu:en"), ctx)).toMatchObject({
      ok: true,
      next: { "@matomezu/base:lang": "matomezu:en" },
    })
    expect(perform(settings, "@matomezu/base:settings-set", lang("matomezu:en"), homeless)).toEqual({
      ok: false,
      reason: "not-allowed",
    })
    // インスタンスに無い言語パックは断る
    expect(perform(settings, "@matomezu/base:settings-set", lang("matomezu:fr"), ctx)).toEqual({
      ok: false,
      reason: "refused",
    })
  })

  test("コントロールセンターが許していないアクションと、知らないアクションは断る", () => {
    const center = CORE_CATALOG.controlCenters.get(BUILTIN_CONTROL_CENTER)!
    const narrow = buildCoreCatalog({
      ...BUILTIN_PARTS,
      controlCenters: [{ ...center, actions: center.actions.filter(a => a !== "@matomezu/base:book-create") }],
    })
    expect(perform(tablesOf([]), "@matomezu/base:book-create", { title: "x" }, { ...ctx, catalog: narrow })).toEqual({
      ok: false,
      reason: "not-allowed",
    })
    // @ts-expect-error 知らない id は型でも誤り
    expect(perform(book, "nope", {}, ctx)).toEqual({ ok: false, reason: "unknown" })
  })
})

describe("テーマの値", () => {
  test("宣言されたテーマキーは、テーマが上書きしていなければ、宣言の既定（共通のテーマキー）の値", () => {
    const values = resolveTokens(CORE_CATALOG, "@matomezu/base:standard", [
      { id: "@matomezu/box:box-fill", fallback: "fill" },
    ])
    expect(values["@matomezu/box:box-fill"]).toEqual(values.fill!)
  })

  test("ページの値には、ページのタイプで使えるアイテムのテーマキーが入る", () => {
    expect(Object.keys(pageTokens(CORE_CATALOG, drawingPage()))).toContain("@matomezu/box:box-fill")
  })
})

describe("error の表", () => {
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
  const NOTES = definePageType({
    id: "notes",
    version: 1,
    title: "@matomezu/drawing:Drawing",
    grouping: "none",
    paper: { allowed: ["@matomezu/base:a4"], default: "@matomezu/base:a4", orientation: "landscape" },
    items: { allowed: [] },
    actions: {},
    theme: "@matomezu/base:standard",
    themeTypes: ["@matomezu/base:diagram"],
    presentation: "@matomezu/paper:paper", // 画面に出さないので、プレゼンテーションは表にあるものを借りる
    tokens: [],
  })
  const catalog = buildCoreCatalog({ ...BUILTIN_PARTS, pageTypes: [...BUILTIN_PARTS.pageTypes, NOTES] })
  const book = testBook("b1", "メモ", [])
  const ctxOf = (c: typeof catalog) => ({
    catalog: c,
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "ja" as const,
    newId: () => "n1",
    now: "2026-10-26T00:00:00.000Z",
    today: "2026-10-26",
    actor: USER,
    naming: NAMING,
  })

  test("足したタイプのページは、それを持つ表でだけ作れて、データの形もその表で通る", () => {
    const made = perform(book, "@matomezu/base:page-add", { type: "notes" }, ctxOf(catalog))
    expect(made).toMatchObject({ ok: true, result: { page: "n1" } })
    expect(made.ok && catalog.bookSchema.safeParse(made.next).success).toBe(true)
    expect(made.ok && CORE_CATALOG.bookSchema.safeParse(made.next).success).toBe(false)
    expect(perform(book, "@matomezu/base:page-add", { type: "notes" }, ctxOf(CORE_CATALOG))).toEqual({
      ok: false,
      reason: "refused",
    })
  })
})

test("ページのタイプのテーマキーは、データに置けるアイテム（allowed）のテーマキーと、その持ち主のプラグインが持つテーマキーを含む", () => {
  const base = CORE_CATALOG.pageTypes.get("@matomezu/drawing:drawing")!
  // 形を置けるタイプ。形のテーマキーはプラグインが持つ
  const drawing = {
    ...base,
    items: { ...base.items, allowed: [...base.items.allowed, "@matomezu/shape:shape-rounded"] },
  }
  const ids = tokenDefsOf(CORE_CATALOG, drawing).map(d => d.id)
  expect(ids).toContain("@matomezu/shape:shape-fill")
  expect(ids).toContain("@matomezu/box:box-fill")
  expect(new Set(ids).size).toBe(ids.length)
})

test("プラグインが持つテーマキーを、アイテムでも宣言したら E011", () => {
  const list = BUILTIN_PARTS.items.find(i => i.id === "@matomezu/list:shape-list")!
  const twice = { ...BUILTIN_PARTS, tokens: [...BUILTIN_PARTS.tokens, list.tokens[0]!] }
  expect(checkCoreCatalog(twice).map(p => p.code)).toEqual(["E011"])
})

test("タイプが allowed に無いアイテムへ指定を渡したら E029", () => {
  const flowchart = BUILTIN_PARTS.pageTypes.find(t => t.id === "@matomezu/flowchart:flowchart")!
  const without = flowchart.items.allowed.filter(id => id !== "@matomezu/line:connector-line")
  const bad = { ...flowchart, items: { ...flowchart.items, allowed: without } }
  const parts = { ...BUILTIN_PARTS, pageTypes: BUILTIN_PARTS.pageTypes.map(t => (t === flowchart ? bad : t)) }
  expect(checkCoreCatalog(parts).map(p => p.code)).toEqual(["E029"])
})

test("タイプがページに足すフィールド（fields）は、そのタイプのページの形に入る。土台のページのフィールドと同じ名前なら E030", () => {
  const tree = BUILTIN_PARTS.pageTypes.find(t => t.id === "@matomezu/tree:tree")!
  const withRoot = { ...tree, fields: { root: z.strictObject({ caption: z.string() }) } }
  const parts = { ...BUILTIN_PARTS, pageTypes: BUILTIN_PARTS.pageTypes.map(t => (t === tree ? withRoot : t)) }
  expect(checkCoreCatalog(parts)).toEqual([])
  const page = buildCoreCatalog(parts).pageSchemas.get(tree.id)!
  const base = {
    kind: "page",
    id: "p1",
    type: tree.id,
    title: "p",
    paper: "@matomezu/base:a4",
    orientation: "landscape",
  }
  expect(page.safeParse({ ...base, root: { caption: "根" } }).success).toBe(true)
  expect(page.safeParse(base).success).toBe(false)
  const clash = { ...tree, fields: { title: z.string(), items: z.array(z.unknown()) } }
  const bad = { ...BUILTIN_PARTS, pageTypes: BUILTIN_PARTS.pageTypes.map(t => (t === tree ? clash : t)) }
  expect(checkCoreCatalog(bad).map(p => [p.code, p.params.field])).toEqual([
    ["E030", "title"],
    ["E030", "items"],
  ])
})

test("付け替えの道具は図面の道具の組だけにあり、フローチャートの組は選択とハンド（形が子を持たない）", () => {
  const toolsOf = (type: string) => {
    const set = BUILTIN_PARTS.pageTypes.find(t => t.id === type)!.tools
    return BUILTIN_PARTS.toolSets.find(s => s.id === set)!.tools
  }
  expect(toolsOf("@matomezu/drawing:drawing")).toContain("@matomezu/paper:reparent")
  expect(toolsOf("@matomezu/flowchart:flowchart")).toEqual(["@matomezu/base:select", "@matomezu/base:hand"])
})

test("道具の組に無い道具を並べたら E032、道具の無い組は E033、ページのタイプが無い組を名指したら E008", () => {
  const set = BUILTIN_PARTS.toolSets.find(s => s.id === "@matomezu/paper:paper")!
  const unknown = { ...set, tools: [...set.tools, "@matomezu/base:pencil"] }
  const empty = { id: "@matomezu/paper:empty", tools: [] }
  const tree = BUILTIN_PARTS.pageTypes.find(t => t.id === "@matomezu/tree:tree")!
  const lost = { ...tree, tools: "@matomezu/tree:none" }
  const parts = {
    ...BUILTIN_PARTS,
    toolSets: [...BUILTIN_PARTS.toolSets.filter(s => s !== set), unknown, empty],
    pageTypes: BUILTIN_PARTS.pageTypes.map(t => (t === tree ? lost : t)),
  }
  expect(checkCoreCatalog(parts).map(problemText)).toEqual([
    "E008 pageType @matomezu/tree:tree: unknown toolSet @matomezu/tree:none",
    "E032 toolSet @matomezu/paper:paper: unknown tool @matomezu/base:pencil",
    "E033 toolSet @matomezu/paper:empty: has no tools",
  ])
})

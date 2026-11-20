import { describe, expect, test } from "bun:test"
import {
  addBinder,
  addPage,
  checkBooks,
  findPage,
  holds,
  keepsPageTypes,
  lineupOf,
  moveEntry,
  pagesOf,
} from "../../web/src/core/book"
import { resolvePaper } from "../../web/src/core/paper"
import { PAPER_IDS } from "../../web/src/plugins/base"
import { choosablePapers, defaultPaper, paperChoices } from "../../web/src/plugins/base/pages/pages"
import { DRAWING, drawingPage, MARKDOWN, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { CORE_CATALOG, sequence } from "../support"

const book = testBook("b1", "ブック", [
  drawingPage("p1"),
  drawingPage("p3", { title: "ページ 3", paper: "@matomezu/base:a3", orientation: "portrait" }),
])

test("足すページの id は、newId の値そのまま（uuid）で振られる。ほかのページと重なる値は飛ばす。足す側は id を決められない", () => {
  const ids = ["p3", "p-2a"]
  const added = addPage(
    book,
    { kind: "page", type: DRAWING, title: "表紙", paper: "@matomezu/base:a5", orientation: "portrait" },
    {},
    () => ids.shift()!,
  )
  expect(added?.page).toBe("p-2a")
  expect(added && pagesOf(added.book).at(-1)).toEqual({
    kind: "page",
    id: "p-2a",
    type: DRAWING,
    title: "表紙",
    paper: "@matomezu/base:a5",
    orientation: "portrait",
  })
  expect(added && pagesOf(added.book).map(p => p.id)).toEqual(["p1", "p3", "p-2a"])
  expect(pagesOf(book)).toHaveLength(2)
})

describe("並び", () => {
  const slides = testBinder("f1", "スライド", SLIDE, testPage(SLIDE, "s1"), testPage(SLIDE, "s2", { title: "2" }))
  const mixed = testBook("b2", "混ざる", [drawingPage("p1"), slides, testPage(MARKDOWN, "t1", { title: "文書" })])

  test("バインダの中のページも並びの順に読め、どのバインダに入っているかも引ける", () => {
    expect(pagesOf(mixed).map(p => p.id)).toEqual(["p1", "s1", "s2", "t1"])
    expect(findPage(mixed, "s2")?.binder?.id).toBe("f1")
    expect(findPage(mixed, "p1")?.binder).toBeNull()
    expect(findPage(mixed, "nope")).toBeUndefined()
  })

  test("並べ替えは同じブックかバインダの中だけ（ブックの並びならブックの並び、バインダの中ならそのバインダの中）", () => {
    expect(lineupOf(moveEntry(mixed, "t1", 0)).map(e => e.id)).toEqual(["t1", "p1", "f1"])
    expect(lineupOf(moveEntry(mixed, "f1", 9)).map(e => e.id)).toEqual(["p1", "t1", "f1"])
    expect(pagesOf(moveEntry(mixed, "s2", 0)).map(p => p.id)).toEqual(["p1", "s2", "s1", "t1"])
    expect(moveEntry(mixed, "nope", 0)).toEqual(mixed)
  })

  test("バインダに足すページは、そのバインダの中に入る", () => {
    const { id: _id, ...third } = testPage(SLIDE, "s3", { title: "3" })
    const added = addPage(mixed, third, { binder: "f1", index: 0 }, sequence("n"))
    expect(added && pagesOf(added.book).map(p => p.id)).toEqual(["p1", "n1", "s1", "s2", "t1"])
    // 無いバインダには足せない
    expect(addPage(mixed, third, { binder: "nope" }, sequence("n"))).toBeUndefined()
  })

  test("一緒に作るバインダに足すと、ページの id・バインダの id の順に振り、バインダは並びの index 番目に入る。空のバインダだけも足せる", () => {
    const { id: _id, ...first } = testPage(SLIDE, "x", { title: "1" })
    const added = addPage(
      mixed,
      first,
      { newBinder: { title: "別のスライド", pageType: SLIDE }, index: 0 },
      sequence("n"),
    )
    expect(added).toMatchObject({ page: "n1", binder: "n2" })
    expect(added && lineupOf(added.book).map(e => e.id)).toEqual(["n2", "p1", "f1", "t1"])
    expect(added && findPage(added.book, "n1")?.binder?.id).toBe("n2")
    const empty = addBinder(mixed, { title: "空", pageType: SLIDE }, undefined, sequence("n"))
    expect(empty.binder).toBe("n1")
    expect(lineupOf(empty.book).at(-1)).toEqual({ kind: "binder", id: "n1", title: "空", pageType: SLIDE, lineup: [] })
  })

  test("並びの決まりを破るブックは読めない", () => {
    const cases: [string, ReturnType<typeof testBook>, boolean][] = [
      ["守っている", mixed, true],
      ["ページの id が重なる", testBook("b", "b", [drawingPage("p1"), drawingPage("p1", { title: "2" })]), false],
      ["ページとバインダの id が重なる", testBook("b", "b", [drawingPage("f1"), slides]), false],
      ["まとまるタイプのページがバインダの外", testBook("b", "b", [testPage(SLIDE, "s1")]), false],
      [
        "まとまらないタイプのページがバインダの中",
        testBook("b", "b", [testBinder("f1", "f", SLIDE, drawingPage("p1") as never)]),
        false,
      ],
      ["バインダの入れるタイプがまとまらないタイプ", testBook("b", "b", [testBinder("f1", "f", DRAWING)]), false],
      ["同じブックかバインダで名前が重なる", testBook("b", "b", [drawingPage("p1"), drawingPage("p2")]), false],
      [
        "バインダの中で名前が重なる",
        testBook("b", "b", [testBinder("f1", "f", SLIDE, testPage(SLIDE, "s1"), testPage(SLIDE, "s2"))]),
        false,
      ],
      [
        "ブックとバインダで分かれていれば同じ名前でよい",
        testBook("b", "b", [drawingPage("p1"), testBinder("f1", "f", SLIDE, testPage(SLIDE, "s1"))]),
        true,
      ],
      [
        "バインダの中で紙が違う",
        testBook("b", "b", [
          testBinder(
            "f1",
            "f",
            SLIDE,
            testPage(SLIDE, "s1", { title: "1" }),
            testPage(SLIDE, "s2", { title: "2", paper: "@matomezu/base:a3" }),
          ),
        ]),
        false,
      ],
      [
        "バインダの中で向きが違う",
        testBook("b", "b", [
          testBinder(
            "f1",
            "f",
            SLIDE,
            testPage(SLIDE, "s1", { title: "1" }),
            testPage(SLIDE, "s2", { title: "2", orientation: "portrait" }),
          ),
        ]),
        false,
      ],
      [
        "バインダが違えば紙が違ってよい。バインダの外のページは、紙が違ってよい",
        testBook("b", "b", [
          drawingPage("p1", { title: "1" }),
          drawingPage("p2", { title: "2", paper: "@matomezu/base:a3" }),
          testBinder("f1", "f", SLIDE, testPage(SLIDE, "s1", { title: "1" })),
          testBinder("f2", "g", SLIDE, testPage(SLIDE, "s2", { title: "1", paper: "@matomezu/base:a3" })),
        ]),
        true,
      ],
    ]
    for (const [name, b, ok] of cases) expect([name, holds(CORE_CATALOG, b)]).toEqual([name, ok])
  })

  test("機能台帳に無いタイプのページは読めないページ（W027）になり、ブックは読める。そのタイプのバインダは、中が読めないページだけなら読める", () => {
    const unknownPage = testBook("b", "b", [
      drawingPage("q1"),
      { ...drawingPage("q2", { title: "2" }), type: "@x/y:z" } as never,
    ])
    const unknownBinder = testBook("d", "d", [
      testBinder("f2", "f", "@x/y:z" as never, { ...drawingPage("q3"), type: "@x/y:z" } as never),
    ])
    const { books, warnings, partial } = checkBooks(CORE_CATALOG, [unknownPage, unknownBinder, mixed])
    expect(books.map(b => b.id)).toEqual(["b", "d", "b2"])
    expect(warnings).toEqual([])
    expect(partial.map(w => [w.code, w.params.book, w.params.pages, w.params.type])).toEqual([
      ["W027", "b", "1", "@x/y:z"],
      ["W027", "d", "1", "@x/y:z"],
    ])
    expect(books[0]?.lineup[1]).toEqual({ kind: "unreadable", id: "q2", title: "2", code: "W027", type: "@x/y:z" })
    expect(books[1]?.lineup).toEqual([
      {
        ...testBinder("f2", "f", "@x/y:z" as never),
        lineup: [{ kind: "unreadable", id: "q3", title: "ページ 1", code: "W027", type: "@x/y:z" }],
      },
    ])
  })

  test("機能台帳に無いタイプの空のバインダのあるブックは、読めない（開けば、タイプの無いバインダを開くことになる）", () => {
    const unknownBinder = testBook("c", "c", [testBinder("f1", "f", "@x/y:z" as never)])
    const { books, warnings } = checkBooks(CORE_CATALOG, [unknownBinder])
    expect(books).toEqual([])
    expect(warnings.map(w => w.params.book)).toEqual(["c"])
  })

  test("ページのタイプとバインダの入れるタイプは、変えた後も同じでなければならない", () => {
    expect(keepsPageTypes(mixed, moveEntry(mixed, "t1", 0))).toBe(true)
    const retyped = testBook("b2", "混ざる", [{ ...drawingPage("p1"), type: MARKDOWN } as never])
    expect(keepsPageTypes(mixed, retyped)).toBe(false)
    const refolded = testBook("b2", "混ざる", [{ ...slides, pageType: DRAWING }])
    expect(keepsPageTypes(mixed, refolded)).toBe(false)
  })
})

describe("紙の規定（図面はページごとに選べる）", () => {
  test("どのページでも、規定の紙を全部選べ、既定は A4 横", () => {
    expect(paperChoices(CORE_CATALOG, book, DRAWING)).toEqual({
      papers: PAPER_IDS,
      orientations: ["portrait", "landscape"],
    })
    expect(defaultPaper(CORE_CATALOG, testBook("b0", "空", []), DRAWING)).toEqual({
      paper: "@matomezu/base:a4",
      orientation: "landscape",
    })
  })

  test("そろえる相手のページがいなければ規定から選び、いれば最初のページの紙と向きだけ", () => {
    const rule = {
      allowed: ["@matomezu/base:a4", "@matomezu/base:a3"],
      default: "@matomezu/base:a4",
      orientation: "landscape" as const,
    }
    expect(choosablePapers(rule, [])).toEqual({
      papers: ["@matomezu/base:a4", "@matomezu/base:a3"],
      orientations: ["portrait", "landscape"],
    })
    expect(
      choosablePapers(rule, [drawingPage("p1", { title: "1", paper: "@matomezu/base:a3", orientation: "portrait" })]),
    ).toEqual({
      papers: ["@matomezu/base:a3"],
      orientations: ["portrait"],
    })
  })
})

test("ブックの形に無い項目があれば形に合わない。ページの形はページのタイプで決まる", () => {
  const ok = testBook("b1", "ブック")
  const page = drawingPage()
  const withPage = (p: object) => ({ ...ok, lineup: [p] })
  expect(CORE_CATALOG.bookSchema.safeParse(ok).success).toBe(true)
  expect(CORE_CATALOG.bookSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false)
  expect(CORE_CATALOG.bookSchema.safeParse({ ...ok, lineup: [] }).success).toBe(true)
  expect(
    CORE_CATALOG.bookSchema.safeParse(withPage({ kind: "page", id: "p1", type: DRAWING, title: "ページ 1" })).success,
  ).toBe(false)
  // 表に無い紙の id も受け取る（描き方は resolvePaper）。向きは決まった値だけ
  expect(CORE_CATALOG.bookSchema.safeParse(withPage({ ...page, paper: "b5" })).success).toBe(true)
  expect(CORE_CATALOG.bookSchema.safeParse(withPage({ ...page, orientation: "up" })).success).toBe(false)
  // 題は 1 字以上、並びは必須
  expect(CORE_CATALOG.bookSchema.safeParse({ ...ok, title: "" }).success).toBe(false)
  expect(CORE_CATALOG.bookSchema.safeParse({ id: "b1", title: "ブック" }).success).toBe(false)
})

describe("ページの紙を描く大きさ", () => {
  test("表にある紙は、その大きさを向きに合わせて描く", () => {
    expect(resolvePaper(CORE_CATALOG, { paper: "@matomezu/base:a4", orientation: "landscape" })).toEqual({
      status: "known",
      size: { w: 1123, h: 794 },
    })
    expect(resolvePaper(CORE_CATALOG, { paper: "@matomezu/base:a4", orientation: "portrait" })).toEqual({
      status: "known",
      size: { w: 794, h: 1123 },
    })
  })

  test("表に無い紙は、表で一番大きい紙で描いて不明とする", () => {
    const unknown = { paper: "b5", orientation: "landscape" as const }
    expect(resolvePaper(CORE_CATALOG, unknown)).toEqual({ status: "unknown", size: { w: 1587, h: 1123 } })
  })

  test("表に紙が 1 つも無ければ、表に無い紙は描けず E131", () => {
    const empty = { ...CORE_CATALOG, papers: new Map(), parts: { ...CORE_CATALOG.parts, papers: [] } }
    expect(() => resolvePaper(empty, { paper: "b5", orientation: "landscape" })).toThrow("E131")
  })
})

import { describe, expect, test } from "bun:test"
import { USER } from "../../web/src/core/actor"
import { pagesOf } from "../../web/src/core/book"
import { ANY_PAGE_TYPE } from "../../web/src/core/def/action"
import { deniedBy, inspect } from "../../web/src/core/inspect"
import { DRAWING, drawingPage, MARKDOWN, SLIDE, testBinder, testBook, testPage } from "../lineup"
import { SAMPLE_BOOKS } from "../sample-books"
import { CORE_CATALOG } from "../support"

const drawing = SAMPLE_BOOKS[0]!

describe("inspect: アクションの許可", () => {
  test("認可ステップが止めれば、そのステップで決まる（ロック中のブック・ページに対して。ページは where で渡したときだけ見る）", () => {
    const locked = { ...drawing, locked: true as const }
    const lock = { source: "permission", id: "@matomezu/base:lock" }
    const answer = inspect(CORE_CATALOG, {
      kind: "action",
      actor: USER,
      action: "@matomezu/base:page-add",
      book: locked,
    })
    expect(answer).toMatchObject({ value: false, decidedBy: lock })
    expect(deniedBy(answer)).toBe("@matomezu/base:lock")
    // ブックのロックを外すアクションは止めない
    expect(
      inspect(CORE_CATALOG, { kind: "action", actor: USER, action: "@matomezu/base:book-unlock", book: locked }).value,
    ).toBe(true)
    const page = pagesOf(drawing)[0]!.id
    const pageLocked = {
      ...drawing,
      lineup: drawing.lineup.map((p, i) => (i === 0 ? { ...p, locked: true as const } : p)),
    }
    const update = { kind: "action", actor: USER, action: "@matomezu/base:page-update", book: pageLocked } as const
    expect(inspect(CORE_CATALOG, { ...update, where: { page } })).toMatchObject({ value: false, decidedBy: lock })
    expect(inspect(CORE_CATALOG, update).value).toBe(true)
    expect(inspect(CORE_CATALOG, { ...update, action: "@matomezu/base:page-unlock", where: { page } }).value).toBe(true)
    // 認可ステップが止めていなければ、止めた認可ステップは無い
    expect(
      deniedBy(
        inspect(CORE_CATALOG, { kind: "action", actor: USER, action: "@matomezu/base:page-add", book: drawing }),
      ),
    ).toBe(null)
  })

  test("ページを名指すアクションは、名指したページのタイプが決め、ブック全体のアクションは、タイプに依らない付く先（attach の books）が決める", () => {
    const mixed = testBook("m1", "混ざる", [drawingPage("p1"), testPage(MARKDOWN, "m1p", { title: "文書" })])
    const place = { kind: "action", actor: USER, action: "@matomezu/paper:item-place", book: mixed } as const
    expect(inspect(CORE_CATALOG, { ...place, where: { page: "p1" } })).toMatchObject({
      value: true,
      decidedBy: { source: "action", id: "@matomezu/paper:item-place", field: "attach", pageType: DRAWING },
    })
    expect(inspect(CORE_CATALOG, { ...place, where: { page: "m1p" } })).toMatchObject({
      value: false,
      decidedBy: { source: "action", id: "@matomezu/paper:item-place", field: "attach", pageType: MARKDOWN },
    })
    // ページを名指さなければ、ブック全体として問う（置くアクションはタイプに依らない付く先を持たない）
    expect(inspect(CORE_CATALOG, place).value).toBe(false)
    expect(
      inspect(CORE_CATALOG, { kind: "action", actor: USER, action: "@matomezu/base:page-add", book: mixed }),
    ).toMatchObject({
      value: true,
      decidedBy: { source: "action", id: "@matomezu/base:page-add", field: "attach.books" },
    })
  })

  test("エントリと作るページは、そのページのタイプ・バインダに入るページのタイプ・作るタイプが決める（タイプが外したアクションは、そのタイプでだけ使えない）", () => {
    const markdown = CORE_CATALOG.pageTypes.get(MARKDOWN)!
    const slide = CORE_CATALOG.pageTypes.get(SLIDE)!
    const without = (ids: string[]) => ({ without: ids }) as never
    const catalog = {
      ...CORE_CATALOG,
      pageTypes: new Map([
        ...CORE_CATALOG.pageTypes,
        [MARKDOWN, { ...markdown, actions: without(["@matomezu/base:page-move", "@matomezu/base:page-add"]) }],
        [SLIDE, { ...slide, actions: without(["@matomezu/base:binder-remove"]) }],
      ]),
    } as typeof CORE_CATALOG
    const book = testBook("m3", "混ざる", [
      drawingPage("p1"),
      testPage(MARKDOWN, "t1", { title: "文書" }),
      testBinder("f1", "スライド", SLIDE, testPage(SLIDE, "s1", { title: "1" })),
    ])
    const ask = (action: string, where: object) =>
      inspect(catalog, { kind: "action", actor: USER, action: `@matomezu/base:${action}`, book, where }).value
    expect(ask("page-move", { entries: ["p1"] })).toBe(true)
    expect(ask("page-move", { entries: ["t1"] })).toBe(false)
    expect(ask("binder-remove", { entries: ["f1"] })).toBe(false)
    expect(ask("binder-move", { entries: ["f1"] })).toBe(true)
    expect(ask("page-add", { creates: DRAWING })).toBe(true)
    expect(ask("page-add", { creates: MARKDOWN })).toBe(false)
    // 作るタイプがまだ分からなければ、どれかのタイプで使えるか
    expect(ask("page-add", { creates: ANY_PAGE_TYPE })).toBe(true)
    // 無いエントリ・無いタイプは、run が断る
    expect(ask("binder-remove", { entries: ["nope"] })).toBe(true)
    expect(ask("page-add", { creates: "@x:nope" })).toBe(true)
  })

  test("ページが対象のアクションを、どのページも変える所（allPages）で問うと、ブックのどのページのタイプでも使えるときだけ。ページを名指さなければ、タイプに依らない付く先（attach の pages）が決める", () => {
    const markdown = CORE_CATALOG.pageTypes.get(MARKDOWN)!
    const without = { ...CORE_CATALOG.pageTypes.get(MARKDOWN)!.actions, without: ["@matomezu/base:page-update"] }
    const catalog = {
      ...CORE_CATALOG,
      pageTypes: new Map([...CORE_CATALOG.pageTypes, [MARKDOWN, { ...markdown, actions: without as never }]]),
    } as typeof CORE_CATALOG
    const mixed = testBook("m4", "混ざる", [drawingPage("p1"), testPage(MARKDOWN, "t1", { title: "文書" })])
    const update = { kind: "action", actor: USER, action: "@matomezu/base:page-update", book: mixed } as const
    expect(inspect(CORE_CATALOG, { ...update, where: { allPages: true } }).value).toBe(true)
    // 1 つのタイプが外していれば、どのページも変える所では使えない（外していないタイプのページを名指せば使える）
    expect(inspect(catalog, { ...update, where: { allPages: true } })).toMatchObject({
      value: false,
      decidedBy: { source: "pageType", id: MARKDOWN, field: "actions.without" },
    })
    expect(inspect(catalog, { ...update, where: { page: "p1" } }).value).toBe(true)
    expect(inspect(catalog, update)).toMatchObject({
      value: true,
      decidedBy: { source: "action", id: "@matomezu/base:page-update", field: "attach.pages" },
    })
    // ページが 1 枚も無ければ、どのページも変える所では使えない
    const empty = testBook("m5", "空", [])
    expect(inspect(CORE_CATALOG, { ...update, book: empty, where: { allPages: true } })).toMatchObject({
      value: false,
      decidedBy: { source: "action", id: "@matomezu/base:page-update", field: "attach.pages" },
    })
  })

  test("名指したページがブックに無ければ、ここでは止めない（無い物は run が断る）", () => {
    const book = testBook("m2", "図", [drawingPage("p1")])
    expect(
      inspect(CORE_CATALOG, {
        kind: "action",
        actor: USER,
        action: "@matomezu/paper:item-place",
        book,
        where: { page: "nope" },
      }),
    ).toMatchObject({ value: true, decidedBy: { source: "action", id: "@matomezu/paper:item-place", field: "run" } })
  })

  test("ブックが対象でないアクションは、コントロールセンターが決める。コントロールセンターが無ければ使えない", () => {
    expect(
      inspect(
        CORE_CATALOG,
        { kind: "action", actor: USER, action: "@matomezu/base:book-create" },
        { controlCenter: "@matomezu/control-center:control-center" },
      ),
    ).toMatchObject({
      value: true,
      decidedBy: {
        source: "controlCenter",
        id: "@matomezu/control-center:control-center",
        field: "actions",
      },
    })
    expect(
      inspect(
        CORE_CATALOG,
        { kind: "action", actor: USER, action: "@matomezu/base:book-create" },
        { controlCenter: null },
      ),
    ).toMatchObject({
      value: false,
      decidedBy: { source: "controlCenter", id: null },
    })
  })

  test("表に無いアクションは、表で決まる", () => {
    expect(inspect(CORE_CATALOG, { kind: "action", actor: USER, action: "nope" })).toEqual({
      value: false,
      decidedBy: { source: "catalog", table: "actions", id: "nope" },
      steps: [{ from: { source: "catalog", table: "actions", id: "nope" }, value: false }],
    })
  })
})

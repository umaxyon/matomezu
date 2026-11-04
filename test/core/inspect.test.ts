import { describe, expect, test } from "bun:test"
import { deniedBy, inspect } from "../../web/src/core/inspect"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { SAMPLE_BOOKS } from "../sample-books"
import { CORE_CATALOG } from "../support"

const drawing = SAMPLE_BOOKS[0]!

describe("inspect: アクションの許可", () => {
  test("認可ステップが止めれば、そのステップで決まる（ロック中のブック・ページに対して。ページは where で渡したときだけ見る）", () => {
    const locked = { ...drawing, locked: true as const }
    const lock = { source: "permission", id: "@matomezu/base:lock" }
    const answer = inspect(CORE_CATALOG, { kind: "action", action: "@matomezu/base:page-add", book: locked })
    expect(answer).toMatchObject({ value: false, decidedBy: lock })
    expect(deniedBy(answer)).toBe("@matomezu/base:lock")
    // ブックのロックを外すアクションは止めない
    expect(inspect(CORE_CATALOG, { kind: "action", action: "@matomezu/base:book-unlock", book: locked }).value).toBe(
      true,
    )
    const page = drawing.pages[0]!.id
    const pageLocked = {
      ...drawing,
      pages: drawing.pages.map((p, i) => (i === 0 ? { ...p, locked: true as const } : p)),
    }
    const update = { kind: "action", action: "@matomezu/base:page-update", book: pageLocked } as const
    expect(inspect(CORE_CATALOG, { ...update, where: { page } })).toMatchObject({ value: false, decidedBy: lock })
    expect(inspect(CORE_CATALOG, update).value).toBe(true)
    expect(inspect(CORE_CATALOG, { ...update, action: "@matomezu/base:page-unlock", where: { page } }).value).toBe(true)
    // タイプが止めるものは、タイプのステップで決まる
    expect(
      deniedBy(inspect(CORE_CATALOG, { kind: "action", action: "@matomezu/base:book-update", book: MASTER_BOOK })),
    ).toBe(null)
  })

  test("ブックが対象のアクションは、そのブックのタイプが決める", () => {
    expect(inspect(CORE_CATALOG, { kind: "action", action: "@matomezu/base:page-add", book: drawing })).toMatchObject({
      value: true,
      decidedBy: {
        source: "action",
        id: "@matomezu/base:page-add",
        field: "attach",
        bookType: "@matomezu/drawing:drawing",
      },
    })
    // マスターは book-update を外す（付く先はどのブックも）
    expect(
      inspect(CORE_CATALOG, { kind: "action", action: "@matomezu/base:book-update", book: MASTER_BOOK }),
    ).toMatchObject({
      value: false,
      decidedBy: { source: "bookType", id: "@matomezu/master:master", field: "actions.without" },
    })
    expect(inspect(CORE_CATALOG, { kind: "action", action: "@matomezu/base:page-add", book: MASTER_BOOK }).value).toBe(
      false,
    )
  })

  test("一覧と設定のアクションは、ホームのタイプが決める。ホームが無ければ使えない", () => {
    expect(
      inspect(
        CORE_CATALOG,
        { kind: "action", action: "@matomezu/base:book-create" },
        { home: "@matomezu/master:master" },
      ),
    ).toMatchObject({
      value: true,
      decidedBy: { source: "bookType", id: "@matomezu/master:master", field: "actions.add" },
    })
    expect(
      inspect(CORE_CATALOG, { kind: "action", action: "@matomezu/base:book-create" }, { home: null }),
    ).toMatchObject({
      value: false,
      decidedBy: { source: "home", id: null },
    })
  })

  test("表に無いアクションは、表で決まる", () => {
    expect(inspect(CORE_CATALOG, { kind: "action", action: "nope" })).toEqual({
      value: false,
      decidedBy: { source: "catalog", table: "actions", id: "nope" },
      steps: [{ from: { source: "catalog", table: "actions", id: "nope" }, value: false }],
    })
  })
})

import { describe, expect, test } from "bun:test"
import { USER } from "../../web/src/core/actor"
import { deniedBy, inspect } from "../../web/src/core/inspect"
import { withPages } from "../lineup"
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
    const page = drawing.pages[0]!.id
    const pageLocked = withPages(
      drawing,
      drawing.pages.map((p, i) => (i === 0 ? { ...p, locked: true as const } : p)),
    )
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

  test("ブックが対象のアクションは、そのブックのタイプが決める", () => {
    expect(
      inspect(CORE_CATALOG, { kind: "action", actor: USER, action: "@matomezu/base:page-add", book: drawing }),
    ).toMatchObject({
      value: true,
      decidedBy: {
        source: "action",
        id: "@matomezu/base:page-add",
        field: "attach",
        pageType: "@matomezu/drawing:drawing",
      },
    })
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

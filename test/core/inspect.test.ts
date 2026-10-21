import { describe, expect, test } from "bun:test"
import { defineTheme } from "../../web/src/core/def/theme"
import { inspect } from "../../web/src/core/inspect"
import { buildRegistry } from "../../web/src/core/registry"
import { shades } from "../../web/src/core/theme"
import { STANDARD } from "../../web/src/plugins/base/standard"
import { MASTER_BOOK } from "../../web/src/plugins/master"
import { SAMPLE_BOOKS } from "../../web/src/sample-books"
import { BUILTIN_PARTS, REGISTRY } from "../support"

const drawing = SAMPLE_BOOKS[0]!

describe("inspect: テーマの値", () => {
  test("宣言された欄は、テーマが上書きしなければ既定の共通の欄で決まり、見た段を順に返す", () => {
    expect(inspect(REGISTRY, { kind: "token", book: drawing, token: "box.fill" })).toEqual({
      value: shades(STANDARD.base.fill),
      decidedBy: { source: "theme", id: "standard", field: "base", key: "fill" },
      steps: [
        { from: { source: "theme", id: "standard", field: "tokens", key: "box.fill" }, value: null },
        { from: { source: "theme", id: "standard", field: "base", key: "fill" }, value: shades(STANDARD.base.fill) },
      ],
    })
  })

  test("テーマが上書きした欄は、上書きで決まる。後の段も並べる", () => {
    const yellow = defineTheme({ ...STANDARD, tokens: { "box.fill": "#fff3c4" } })
    const reg = buildRegistry({ ...BUILTIN_PARTS, themes: [yellow] })
    const got = inspect(reg, { kind: "token", book: drawing, token: "box.fill" })
    expect(got.value).toEqual({ light: "#fff3c4", dark: "#fff3c4" })
    expect(got.decidedBy).toEqual({ source: "theme", id: "standard", field: "tokens", key: "box.fill" })
    expect(got.steps).toHaveLength(2)
  })

  test("共通の欄はテーマの値。どれでもない欄は値が無い", () => {
    expect(inspect(REGISTRY, { kind: "token", book: drawing, token: "paper" }).value).toEqual(
      shades(STANDARD.base.paper),
    )
    expect(inspect(REGISTRY, { kind: "token", book: drawing, token: "nope" })).toEqual({
      value: null,
      decidedBy: null,
      steps: [],
    })
  })
})

describe("inspect: アクションの許可", () => {
  test("ブックが対象のアクションは、そのブックのタイプが決める", () => {
    expect(inspect(REGISTRY, { kind: "action", action: "page.add", book: drawing })).toMatchObject({
      value: true,
      decidedBy: { source: "bookType", id: "drawing", field: "actions.defaults" },
    })
    expect(inspect(REGISTRY, { kind: "action", action: "page.add", book: MASTER_BOOK }).value).toBe(false)
  })

  test("一覧と設定のアクションは、ホームのタイプが決める。ホームが無ければ使えない", () => {
    expect(inspect(REGISTRY, { kind: "action", action: "book.create" }, { home: "master" })).toMatchObject({
      value: true,
      decidedBy: { source: "home", id: "master", field: "actions.defaults" },
    })
    expect(inspect(REGISTRY, { kind: "action", action: "book.create" }, { home: null })).toMatchObject({
      value: false,
      decidedBy: { source: "home", id: null, field: "actions.defaults" },
    })
  })

  test("表に無いアクションは、表で決まる", () => {
    expect(inspect(REGISTRY, { kind: "action", action: "nope" })).toEqual({
      value: false,
      decidedBy: { source: "registry", table: "actions", id: "nope" },
      steps: [{ from: { source: "registry", table: "actions", id: "nope" }, value: false }],
    })
  })
})

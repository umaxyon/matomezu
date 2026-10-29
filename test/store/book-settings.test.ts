// ブックのタイプが足す設定の項目（core/book-settings.ts）と、それを受け付ける base のアクション book-update・page-update
import { expect, test } from "bun:test"
import { z } from "zod"
import { withSettings } from "../../web/src/core/book"
import type { BookOf } from "../../web/src/core/schema/book"
import { settingsArgs, settingsPatchOf } from "../../web/src/plugins/base/book-settings"
import { CORE_CATALOG, newStore } from "../support"

test("選んだ項目を、変えるときに渡す形にする: どれも書かなくてよく、null は消す。選んでいない項目は受け付けない", () => {
  const book = newStore().state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">
  const patch = settingsPatchOf(CORE_CATALOG, book, "book")
  if (!patch) throw new Error("no settings")
  expect(patch.safeParse({}).success).toBe(true)
  expect(patch.safeParse({ "@matomezu/line:line-route": null }).success).toBe(true)
  expect(patch.safeParse({ "@matomezu/line:line-route": "zigzag" }).success).toBe(false)
  expect(patch.safeParse({ c: 1 }).success).toBe(false)
  const before: object = { id: "p", settings: { a: "x", b: 1, c: true } }
  expect(withSettings(before, { a: "y", b: null })).toEqual({ id: "p", settings: { a: "y", c: true } })
  // 項目が 1 つも無くなれば settings のフィールドも消す
  expect(withSettings<object>({ id: "p", settings: { a: "x" } }, { a: null })).toEqual({ id: "p" })
})

test("@matomezu/base:book-update・@matomezu/base:page-update は、ブックのタイプが宣言した項目だけを settings で受け付ける。宣言の無い項目・無いページは断る", () => {
  const store = newStore()
  const book = () => store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">
  expect(
    store.actions.perform(
      "@matomezu/base:book-update",
      { settings: { "@matomezu/line:line-route": "straight" } },
      { book: "b1" },
    ).ok,
  ).toBe(true)
  expect(book().settings?.["@matomezu/line:line-route"]).toBe("straight")
  expect(store.actions.perform("@matomezu/base:book-update", { settings: { color: "red" } }, { book: "b1" }).ok).toBe(
    false,
  )
  expect(
    store.actions.perform(
      "@matomezu/base:page-update",
      { page: "p1", settings: { "@matomezu/line:line-route": "elbow" } },
      { book: "b1" },
    ).ok,
  ).toBe(true)
  expect(book().pages[0]!.settings?.["@matomezu/line:line-route"]).toBe("elbow")
  expect(
    store.actions.perform(
      "@matomezu/base:page-update",
      { page: "nope", settings: { "@matomezu/line:line-route": "elbow" } },
      { book: "b1" },
    ).ok,
  ).toBe(false)
  // 名前などの共通の項目と、タイプの項目を 1 回で変えられる
  expect(
    store.actions.perform(
      "@matomezu/base:book-update",
      { title: "新しい名前", settings: { "@matomezu/line:line-route": null } },
      { book: "b1" },
    ).ok,
  ).toBe(true)
  expect([book().title, "settings" in book()]).toEqual(["新しい名前", false])
  // ページの名前も page-update で変える（settings は書かなくてよい。空の名前は断る）
  expect(store.actions.perform("@matomezu/base:page-update", { page: "p1", title: "表紙" }, { book: "b1" }).ok).toBe(
    true,
  )
  expect(book().pages[0]!.title).toBe("表紙")
  expect(store.actions.perform("@matomezu/base:page-update", { page: "p1", title: "  " }, { book: "b1" }).ok).toBe(
    false,
  )
  expect(book().pages[0]!.settings?.["@matomezu/line:line-route"]).toBe("elbow")
})

test("AI に見せる settings の形は、項目を宣言したタイプごとの形（説明にタイプの id）。タイプがいくつもあれば、そのどれか", () => {
  const schema = z.toJSONSchema(settingsArgs(CORE_CATALOG, "book"), { io: "input" }) as {
    anyOf?: { description?: string; properties?: object }[]
  }
  const byType = Object.fromEntries((schema.anyOf ?? []).map(s => [s.description, Object.keys(s.properties ?? {})]))
  expect(byType).toEqual({
    "settings of @matomezu/dir:dir books": [
      "@matomezu/base:book-theme",
      "@matomezu/base:book-paper-color",
      "@matomezu/base:book-text-colors",
    ],
    "settings of @matomezu/drawing:drawing books": [
      "@matomezu/base:book-theme",
      "@matomezu/base:book-paper-color",
      "@matomezu/line:line-route",
      "@matomezu/base:book-text-colors",
    ],
    "settings of @matomezu/flowchart:flowchart books": [
      "@matomezu/base:book-theme",
      "@matomezu/base:book-paper-color",
      "@matomezu/line:line-route",
      "@matomezu/flowchart:flow-direction",
      "@matomezu/base:book-text-colors",
    ],
    "settings of @matomezu/tree:tree books": [
      "@matomezu/base:book-theme",
      "@matomezu/base:book-paper-color",
      "@matomezu/tree:grow",
      "@matomezu/tree:node-size",
      "@matomezu/tree:node-shape",
      "@matomezu/tree:line-shape",
      "@matomezu/base:book-text-colors",
    ],
  })
})

test("@matomezu/base:page-add も、ページの設定の項目を settings で受け付けて作る。選んでいない項目は断る", () => {
  const store = newStore()
  const book = () => store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">
  const add = (settings: unknown) =>
    store.actions.perform("@matomezu/base:page-add", { title: "直線", settings } as never, { book: "b1" })
  expect(add({ "@matomezu/flowchart:flow-direction": "right" }).ok).toBe(false)
  const done = add({ "@matomezu/line:line-route": "straight" })
  expect(done.ok).toBe(true)
  expect(book().pages.at(-1)).toMatchObject({ title: "直線", settings: { "@matomezu/line:line-route": "straight" } })
})

test("ブックの設定の項目も、変えるときの値の形は機能台帳から組み立てた形（describe）。テーマは表にあるテーマのどれかで、AI にもその形で見せる", () => {
  const store = newStore()
  const theme = (id: string) =>
    store.actions.perform(
      "@matomezu/base:book-update",
      { settings: { "@matomezu/base:book-theme": id } },
      { book: "b1" },
    ).ok
  expect(theme("@matomezu/base:sticky")).toBe(true)
  expect(theme("@ex/gone:theme")).toBe(false)
  expect(JSON.stringify(z.toJSONSchema(settingsArgs(CORE_CATALOG, "book")))).toContain("@matomezu/base:sticky")
})

// ページのタイプが選ぶ設定の項目（plugins/base/book-settings.ts）と、それを受け付ける base のアクション pages-update・page-update・page-add
import { expect, test } from "bun:test"
import { z } from "zod"
import { pagesOf, withSettings } from "../../../web/src/core/book"
import type { Book } from "../../../web/src/core/schema/book"
import { ownSettings, settingsArgs, settingsPatchOf } from "../../../web/src/plugins/base/book-settings"
import { CORE_CATALOG, newStore } from "../../support"

test("選んだ項目を、変えるときに渡す形にする: どれも書かなくてよく、null は消す。選んでいない項目は受け付けない", () => {
  const patch = settingsPatchOf(CORE_CATALOG, "@matomezu/drawing:drawing")
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

test("@matomezu/base:pages-update・@matomezu/base:page-update は、ページのタイプが選んだ項目だけを settings で受け付ける。選んでいない項目・無いページは断る", () => {
  const store = newStore()
  const book = () => store.state.getState().books.b1 as Book
  expect(
    store.actions.perform(
      "@matomezu/base:pages-update",
      { pages: "all", settings: { "@matomezu/line:line-route": "straight" } },
      { book: "b1" },
    ).ok,
  ).toBe(true)
  expect(ownSettings(pagesOf(book())[0]!)["@matomezu/line:line-route"]).toBe("straight")
  expect(
    store.actions.perform("@matomezu/base:pages-update", { pages: "all", settings: { color: "red" } }, { book: "b1" })
      .ok,
  ).toBe(false)
  expect(
    store.actions.perform(
      "@matomezu/base:page-update",
      { settings: { "@matomezu/line:line-route": "elbow" } },
      { page: "p1" },
    ).ok,
  ).toBe(true)
  expect(ownSettings(pagesOf(book())[0]!)["@matomezu/line:line-route"]).toBe("elbow")
  expect(
    store.actions.perform(
      "@matomezu/base:page-update",
      { settings: { "@matomezu/line:line-route": "elbow" } },
      { page: "nope" },
    ).ok,
  ).toBe(false)
  // ブックの名前は book-update で変える。ページの項目は、ブックには持てない
  expect(store.actions.perform("@matomezu/base:book-update", { title: "新しい名前" }, { book: "b1" }).ok).toBe(true)
  expect(
    store.actions.perform(
      "@matomezu/base:book-update",
      { settings: { "@matomezu/line:line-route": "straight" } } as never,
      { book: "b1" },
    ).ok,
  ).toBe(false)
  expect([book().title, "settings" in book()]).toEqual(["新しい名前", false])
  // ページの名前も page-update で変える（settings は書かなくてよい。空の名前は断る）
  expect(store.actions.perform("@matomezu/base:page-update", { title: "表紙" }, { page: "p1" }).ok).toBe(true)
  expect(pagesOf(book())[0]!.title).toBe("表紙")
  expect(store.actions.perform("@matomezu/base:page-update", { title: "  " }, { page: "p1" }).ok).toBe(false)
  expect(ownSettings(pagesOf(book())[0]!)["@matomezu/line:line-route"]).toBe("elbow")
})

test("AI に見せるページの settings の形は、項目を選んだタイプごとの形（説明にタイプの id）。タイプがいくつもあれば、そのどれか。印刷プレビューの設定（ブックの項目）は見せない", () => {
  const schema = z.toJSONSchema(settingsArgs(CORE_CATALOG), { io: "input" }) as {
    anyOf?: { description?: string; properties?: object }[]
  }
  const byType = Object.fromEntries((schema.anyOf ?? []).map(s => [s.description, Object.keys(s.properties ?? {})]))
  expect(byType).toEqual({
    "settings of @matomezu/dir:dir pages": [
      "@matomezu/base:page-theme",
      "@matomezu/base:page-paper-color",
      "@matomezu/base:page-text-colors",
      "@matomezu/dir:notes",
      "@matomezu/base:background-print",
    ],
    "settings of @matomezu/drawing:drawing pages": [
      "@matomezu/base:page-theme",
      "@matomezu/base:page-paper-color",
      "@matomezu/line:line-route",
      "@matomezu/base:page-text-colors",
      "@matomezu/base:background-print",
    ],
    "settings of @matomezu/flowchart:flowchart pages": [
      "@matomezu/base:page-theme",
      "@matomezu/base:page-paper-color",
      "@matomezu/line:line-route",
      "@matomezu/flowchart:flow-direction",
      "@matomezu/base:page-text-colors",
      "@matomezu/base:background-print",
    ],
    "settings of @matomezu/markdown:markdown pages": ["@matomezu/base:page-theme", "@matomezu/base:page-paper-color"],
    "settings of @matomezu/slide-book:slide pages": [
      "@matomezu/base:page-theme",
      "@matomezu/base:page-paper-color",
      "@matomezu/slide-book:slide-print",
    ],
    "settings of @matomezu/tree:tree pages": [
      "@matomezu/base:page-theme",
      "@matomezu/base:page-paper-color",
      "@matomezu/tree:grow",
      "@matomezu/tree:node-size",
      "@matomezu/tree:node-shape",
      "@matomezu/tree:line-shape",
      "@matomezu/base:page-text-colors",
      "@matomezu/base:background-print",
    ],
  })
})

test("@matomezu/base:page-add も、ページの設定の項目を settings で受け付けて作る。選んでいない項目は断る", () => {
  const store = newStore()
  const book = () => store.state.getState().books.b1 as Book
  const add = (settings: unknown) =>
    store.actions.perform(
      "@matomezu/base:page-add",
      { type: "@matomezu/drawing:drawing", title: "直線", settings } as never,
      { book: "b1" },
    )
  expect(add({ "@matomezu/flowchart:flow-direction": "right" }).ok).toBe(false)
  const done = add({ "@matomezu/line:line-route": "straight" })
  expect(done.ok).toBe(true)
  expect(pagesOf(book()).at(-1)).toMatchObject({ title: "直線", settings: { "@matomezu/line:line-route": "straight" } })
})

test("ページの設定の項目も、変えるときの値の形は機能台帳から組み立てた形（describe）。テーマは表にあるテーマのどれかで、AI にもその形で見せる", () => {
  const store = newStore()
  const theme = (id: string) =>
    store.actions.perform(
      "@matomezu/base:pages-update",
      { pages: "all", settings: { "@matomezu/base:page-theme": id } },
      { book: "b1" },
    ).ok
  expect(theme("@matomezu/base:sticky")).toBe(true)
  expect(theme("@ex/gone:theme")).toBe(false)
  expect(JSON.stringify(z.toJSONSchema(settingsArgs(CORE_CATALOG)))).toContain("@matomezu/base:sticky")
})

// ブックのタイプが足す設定の項目（core/book-settings.ts）と、それを受け付ける base のアクション book-update・page-update
import { expect, test } from "bun:test"
import { z } from "zod"
import { settingsArgs, settingsPatchOf, withSettings } from "../../web/src/core/book-settings"
import type { BookOf } from "../../web/src/core/schema/book"
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
  // 項目が 1 つも無くなれば settings の欄も消す
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
})

test("AI に見せる settings の形は、項目を宣言したタイプごとの形（説明にタイプの id）", () => {
  const schema = z.toJSONSchema(settingsArgs(CORE_CATALOG, "book"), { io: "input" }) as {
    description?: string
    properties?: object
  }
  expect(schema.description).toBe("settings of @matomezu/drawing:drawing books")
  expect(Object.keys(schema.properties ?? {})).toEqual([
    "@matomezu/base:book-theme",
    "@matomezu/base:book-paper-color",
    "@matomezu/line:line-route",
  ])
})

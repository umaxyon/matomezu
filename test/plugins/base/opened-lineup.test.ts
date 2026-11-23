// ステージで開いている物の並びで変わる事（base/page-tabs/opened-lineup.ts）: 並び・削除を出すか・バインダの設定の確定で行うアクション

import { expect, test } from "bun:test"
import type { BinderEntry } from "../../../web/src/core/schema/book"
import {
  binderSettingsSteps,
  NO_LINEUP,
  openedLineup,
  showsPageDelete,
} from "../../../web/src/plugins/base/page-tabs/opened-lineup"
import { NO_BOOK, NO_OUTSIDE_BINDER } from "../../../web/src/store/commands/def"
import { SLIDE, testBinder, testBook, testPage } from "../../lineup"

const binder = (...ids: string[]) =>
  testBinder("n1", "束", SLIDE, ...ids.map(id => testPage(SLIDE, id, { title: id }))) as BinderEntry
const book = testBook("b1", "ブック", [binder("s1")])

test("開いている物の並びは、ブックか、ブックの外のバインダ 1 つだけの並び。どちらも無ければ無い", () => {
  expect(openedLineup(book, NO_OUTSIDE_BINDER)).toBe(book)
  const n1 = binder("s1", "s2")
  expect(openedLineup(NO_BOOK, n1)).toEqual({ id: "n1", lineup: [n1] })
  expect(openedLineup(NO_BOOK, NO_OUTSIDE_BINDER)).toBe(NO_LINEUP)
})

test("ページの削除は、ブックのページと、ブックの外のバインダの最後の 1 枚でないページに出す", () => {
  expect(showsPageDelete(book, NO_OUTSIDE_BINDER)).toBe(true)
  expect(showsPageDelete(NO_BOOK, binder("s1", "s2"))).toBe(true)
  expect(showsPageDelete(NO_BOOK, binder("s1"))).toBe(false)
  expect(showsPageDelete(NO_BOOK, NO_OUTSIDE_BINDER)).toBe(false)
})

test("バインダの設定の確定は、ブックの中なら binder-update 1 回、ブックの外なら名前を entry-rename で先に、紙と向きを binder-update で行う", () => {
  const patch = { title: "新", orientation: "portrait" as const }
  expect(binderSettingsSteps("n1", patch, false)).toEqual([
    { action: "@matomezu/base:binder-update", args: { binder: "n1", title: "新", orientation: "portrait" } },
  ])
  expect(binderSettingsSteps("n1", patch, true)).toEqual([
    { action: "@matomezu/base:entry-rename", args: { entry: "n1", title: "新" } },
    { action: "@matomezu/base:binder-update", args: { binder: "n1", orientation: "portrait" } },
  ])
  expect(binderSettingsSteps("n1", { title: "新" }, true)).toEqual([
    { action: "@matomezu/base:entry-rename", args: { entry: "n1", title: "新" } },
  ])
  expect(binderSettingsSteps("n1", {}, true)).toEqual([])
  expect(binderSettingsSteps("n1", {}, false)).toEqual([])
})

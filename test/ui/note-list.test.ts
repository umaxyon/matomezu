// 伝言一覧の並び（base/note-list/rows.ts）: ページの順にまとめ、ページの中は付けた時点の新しい順。ページの見つからない物は最後。時刻は同じ日なら時:分
import { expect, test } from "bun:test"
import type { Annotation } from "../../web/src/core/annotation"
import type { Book } from "../../web/src/core/schema/book"
import { defineLeftSidePanelTab } from "../../web/src/plugins/base/left-side-panel/ui"
import { newlyRead } from "../../web/src/plugins/base/note/ReadNotice"
import { listedPages, shownTime } from "../../web/src/plugins/base/note-list/rows"
import { defineAnnotationIcon } from "../../web/src/plugins/base/note-list/ui"
import { CORE_CATALOG } from "../support"

const box = (id: string) => ({ id, item: "@matomezu/box:shape-nest-box", x: 0, y: 0, props: { caption: id, body: "" } })
const book = {
  type: "@matomezu/drawing:drawing",
  id: "b1",
  title: "見本",
  pages: [
    { id: "p1", title: "一", paper: "@matomezu/base:a4", orientation: "landscape", items: [box("a"), box("b")] },
    { id: "p2", title: "二", paper: "@matomezu/base:a4", orientation: "landscape", items: [box("c")] },
  ],
} as unknown as Book
const note = (id: string, anchor: string, addedAt: string): Annotation => ({
  id,
  annotation: "@matomezu/base:note",
  anchors: [anchor],
  props: { text: id, bubble: true, addedAt },
})

test("ページの順にまとめ、ページの中は付けた時点の新しい順に並べる", () => {
  const listed = listedPages(CORE_CATALOG, book, [
    note("n1", "c", "2026-11-05T01:00:00.000Z"),
    note("n2", "a", "2026-11-05T02:00:00.000Z"),
    note("n3", "b", "2026-11-05T03:00:00.000Z"),
  ])
  expect(listed.map(p => [p.page, p.title, p.rows.map(r => r.id)])).toEqual([
    ["p1", "一", ["n3", "n2"]],
    ["p2", "二", ["n1"]],
  ])
})

test("時刻は、同じ日なら時:分、ほかの日は月/日 時:分", () => {
  const now = new Date(2026, 10, 5, 15, 0)
  expect(shownTime(new Date(2026, 10, 5, 9, 5).toISOString(), now)).toBe("9:05")
  expect(shownTime(new Date(2026, 10, 4, 23, 30).toISOString(), now)).toBe("11/4 23:30")
  expect(shownTime("x", now)).toBe("")
})

test("伝言が読まれた知らせは、前に未読だった伝言が読まれたときだけ", () => {
  const unread = note("n1", "a", "t")
  const read = { ...unread, props: { ...(unread.props as object), readAt: "u" } }
  expect(newlyRead(new Set(["n1"]), { b1: [read] })).toBe(true)
  expect(newlyRead(new Set(["n1"]), { b1: [unread] })).toBe(false)
  expect(newlyRead(new Set(), { b1: [read] })).toBe(false)
})

test("左サイドパネルのタブと行の絵は、追加プラグインなら place で置いてほしいと書ける（true なら末尾、before・after ならその前・後ろ）", () => {
  const tab = defineLeftSidePanelTab({
    id: "@x/t:tab",
    title: "@matomezu/base:Note list",
    place: true,
    view: () => null,
  })
  expect(tab.place).toEqual({ slot: "@matomezu/base:left-side-panel" })
  const after = defineLeftSidePanelTab({
    id: "@x/t:tab2",
    title: "@matomezu/base:Note list",
    place: { after: "@matomezu/base:note-list" },
    view: () => null,
  })
  expect(after.place).toEqual({ slot: "@matomezu/base:left-side-panel", after: "@matomezu/base:note-list" })
  const icon = defineAnnotationIcon({ id: "@x/t:icon", annotation: "@x/t:sticky", place: true, view: () => null })
  expect(icon.place).toEqual({ slot: "@matomezu/base:annotation-icon" })
  expect(defineAnnotationIcon({ id: "@x/t:icon2", annotation: "@x/t:sticky", view: () => null }).place).toBeUndefined()
})

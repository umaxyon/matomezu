// まだ見ていない変更が見えたか（changeSeen）: ブック 1 冊のページとフォルダの行の前と後から、開いているページの変更だけを見て、アイテムは変えた物（子の形を変えたならその子）を、
// 前と後のページの行で聞く
import { expect, test } from "bun:test"
import { tablesOf } from "../../web/src/core/folders-books"
import { changesBetween } from "../../web/src/core/folders-changes"
import { changeSeen, rowChangesOf } from "../../web/src/core/history"
import type { Book } from "../../web/src/core/schema/book"

const box = (id: string, caption: string, shapes?: unknown[]) => ({
  id,
  x: 0,
  y: 0,
  props: { caption },
  ...(shapes ? { shapes } : {}),
})
const page = (id: string, items: unknown[]) => ({ kind: "page", id, type: "t", title: id, items })
const book = (items: unknown[], title = "本", second: unknown[] = []) =>
  ({ id: "b", title, lineup: [page("p", items), page("q", second)] }) as unknown as Book
// バインダ f の中にページ s を入れたブック
const folded = (items: unknown[], other: unknown[] = []) =>
  ({
    id: "b",
    title: "本",
    lineup: [page("p", other), { kind: "binder", id: "f", title: "f", pageType: "t", lineup: [page("s", items)] }],
  }) as unknown as Book
// ブックを before から after にした変更が、ページ page を開いているステージで見えたか（物は seen に聞く。聞いた物の、前と後のどちらの値かを after で答える）
const decided = (before: Book, after: Book, page: string | null, seen?: (id: string, after: boolean) => boolean) => {
  const rows = rowChangesOf(tablesOf([before]), changesBetween([before], [after]))
  const late = tablesOf([after]).pages
  return changeSeen(rows, page, seen && ((row, id) => seen(id, late[row.id] === row)))
}
const asked = (before: Book, after: Book, page: string | null) => {
  const ids: string[] = []
  const seen = decided(before, after, page, id => {
    ids.push(id)
    return false
  })
  return { seen, ids: [...new Set(ids)] }
}

test("子の形だけを変えたなら、その子を聞く（親は聞かない）。親のフィールドも変えたなら親も聞く", () => {
  const before = book([box("a", "親", [box("c", "子")])])
  expect(asked(before, book([box("a", "親", [box("c", "AI")])]), "p")).toEqual({ seen: false, ids: ["c"] })
  expect(asked(before, book([box("a", "AI", [box("c", "AI")])]), "p")).toEqual({ seen: false, ids: ["a", "c"] })
})

test("ほかのページの変更は見えていない。ブックのフィールドの変更と、ページを開いていないなら、開いていれば見えた", () => {
  const before = book([box("a", "a")])
  expect(asked(before, book([box("a", "a")], "本", [box("x", "AI")]), "p")).toEqual({ seen: false, ids: [] })
  expect(asked(before, book([box("a", "a")], "AI の題"), "p")).toEqual({ seen: true, ids: [] })
  expect(asked(before, book([box("a", "AI")]), null)).toEqual({ seen: true, ids: [] })
})

test("バインダの中のページの変更は、そのページを開いていれば聞き、ほかのページを開いていれば見えていない", () => {
  const before = folded([box("a", "a")])
  expect(asked(before, folded([box("a", "AI")]), "s")).toEqual({ seen: false, ids: ["a"] })
  expect(asked(before, folded([box("a", "AI")]), "p")).toEqual({ seen: false, ids: [] })
  expect(asked(before, folded([box("a", "a")], [box("x", "AI")]), "s")).toEqual({ seen: false, ids: [] })
})

// ページ p・q と、バインダ f（中にページ s・t）を、lineup の順に並べたブック
const p = (items: unknown[] = [], rest: object = {}) => ({ ...page("p", items), ...rest })
const q = page("q", [])
const s = (items: unknown[] = []) => page("s", items)
const t = page("t", [])
const binder = (id: string, ...pages: unknown[]) => ({ kind: "binder", id, title: id, pageType: "t", lineup: pages })
const lined = (lineup: unknown[], rest: object = {}) => ({ id: "b", title: "本", lineup, ...rest }) as unknown as Book
const seenOn = (before: Book, after: Book, page: string | null) => asked(before, after, page).seen

test("並びの順だけを変えたなら、開いていれば見えた。ほかのページの変更も一緒なら、開いているページは見えていない", () => {
  expect(seenOn(lined([p(), q]), lined([q, p()]), "p")).toBe(true)
  expect(seenOn(lined([p(), q]), lined([{ ...q, title: "AI" }, p()]), "p")).toBe(false)
})

test("バインダの中の順だけ・バインダの名前だけを変えたなら、その中のページは見えていない", () => {
  expect(seenOn(lined([binder("f", s(), t)]), lined([binder("f", t, s())]), "s")).toBe(false)
  expect(seenOn(lined([binder("f", s(), t)]), lined([{ ...binder("f", s(), t), title: "AI" }]), "s")).toBe(false)
})

test("開いているページを足した・無くしたなら、見えた。ほかのページを足した・無くしただけなら、見えていない", () => {
  expect(seenOn(lined([q]), lined([p(), q]), "p")).toBe(true)
  expect(seenOn(lined([p(), q]), lined([q]), "p")).toBe(true)
  expect(seenOn(lined([p()]), lined([p(), q]), "p")).toBe(false)
  expect(seenOn(lined([p(), q]), lined([p()]), "p")).toBe(false)
  expect(seenOn(lined([binder("f", t)]), lined([binder("f", s(), t)]), "s")).toBe(true)
  expect(seenOn(lined([binder("f", s(), t)]), lined([binder("f", t)]), "s")).toBe(true)
})

test("ページをバインダの外と中・バインダの間で動かしたなら、そのページは見えた", () => {
  expect(seenOn(lined([p(), binder("f", t)]), lined([binder("f", p(), t)]), "p")).toBe(true)
  expect(seenOn(lined([binder("f", p(), t)]), lined([p(), binder("f", t)]), "p")).toBe(true)
  expect(seenOn(lined([binder("f", s(), t), binder("g")]), lined([binder("f", t), binder("g", s())]), "s")).toBe(true)
  expect(seenOn(lined([p(), q]), lined([binder("f", p()), q]), "p")).toBe(true)
})

test("バインダごと足した・無くしたなら、その中のページは見えていない（バインダの中を動いた物も）", () => {
  expect(seenOn(lined([q]), lined([q, binder("f", s())]), "s")).toBe(false)
  expect(seenOn(lined([q, binder("f", s())]), lined([q]), "s")).toBe(false)
  expect(seenOn(lined([binder("f", s())]), lined([binder("g", s([box("a", "AI")]))]), "s")).toBe(false)
})

test("ページのアイテムのほかのフィールド・アイテムの順だけ・アイテムを初めて持った変更は、開いていれば見えた", () => {
  expect(seenOn(lined([p([box("a", "a")])]), lined([p([box("a", "a")], { title: "AI" })]), "p")).toBe(true)
  expect(seenOn(lined([p([box("a", "a"), box("c", "c")])]), lined([p([box("c", "c"), box("a", "a")])]), "p")).toBe(true)
  const bare = { kind: "page", id: "p", type: "t", title: "p" }
  expect(seenOn(lined([bare]), lined([p([box("a", "AI")])]), "p")).toBe(true)
})

test("アイテムを足した・無くしたなら、その物を前と後で聞く", () => {
  expect(asked(lined([p([box("a", "a")])]), lined([p([box("a", "a"), box("c", "AI")])]), "p")).toEqual({
    seen: false,
    ids: ["c"],
  })
  expect(asked(lined([p([box("a", "a"), box("c", "c")])]), lined([p([box("a", "a")])]), "p")).toEqual({
    seen: false,
    ids: ["c"],
  })
})

test("ブックの設定の項目を変えたなら、どのページを開いていても見えた", () => {
  expect(seenOn(lined([p(), q]), lined([p(), q], { settings: { x: 1 } }), "q")).toBe(true)
  expect(seenOn(lined([p(), q]), lined([p(), q], { locked: true }), "p")).toBe(true)
})

test("アイテムの変更は、聞く関数が見えたと答えれば見えた。聞く関数が無ければ見えた", () => {
  const before = lined([p([box("a", "a")])])
  const after = lined([p([box("a", "AI")])])
  expect(decided(before, after, "p", (id, late) => id === "a" && late)).toBe(true)
  expect(decided(before, after, "p", (id, late) => id === "a" && !late)).toBe(true)
  expect(decided(before, after, "p")).toBe(true)
})

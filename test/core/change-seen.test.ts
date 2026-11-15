// まだ見ていない変更が見えたか（changeSeen）: 開いているページの変更だけを見て、アイテムは変えた物（子の形を変えたならその子）を、前と後のブックで聞く
import { expect, test } from "bun:test"
import { changeSeen } from "../../web/src/core/history"
import { type Patch, patchOf } from "../../web/src/core/patch"
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
// フォルダ f の中にページ s を入れたブック
const folded = (items: unknown[], other: unknown[] = []) =>
  ({
    id: "b",
    title: "本",
    lineup: [page("p", other), { kind: "folder", id: "f", title: "f", pageType: "t", lineup: [page("s", items)] }],
  }) as unknown as Book
const asked = (before: Book, after: Book, page: string | null) => {
  const ids: string[] = []
  const seen = changeSeen(patchOf(before, after) as Patch, { before, after }, page, (_p, id) => {
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

test("フォルダの中のページの変更は、そのページを開いていれば聞き、ほかのページを開いていれば見えていない", () => {
  const before = folded([box("a", "a")])
  expect(asked(before, folded([box("a", "AI")]), "s")).toEqual({ seen: false, ids: ["a"] })
  expect(asked(before, folded([box("a", "AI")]), "p")).toEqual({ seen: false, ids: [] })
  expect(asked(before, folded([box("a", "a")], [box("x", "AI")]), "s")).toEqual({ seen: false, ids: [] })
})

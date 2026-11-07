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
const book = (items: unknown[], title = "本", second: unknown[] = []) =>
  ({
    id: "b",
    type: "t",
    title,
    pages: [
      { id: "p", items },
      { id: "q", items: second },
    ],
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

test("ほかのページの変更は見えていない。ブックのフィールドの変更と、ページを持たないなら、開いていれば見えた", () => {
  const before = book([box("a", "a")])
  expect(asked(before, book([box("a", "a")], "本", [box("x", "AI")]), "p")).toEqual({ seen: false, ids: [] })
  expect(asked(before, book([box("a", "a")], "AI の題"), "p")).toEqual({ seen: true, ids: [] })
  expect(asked(before, book([box("a", "AI")]), null)).toEqual({ seen: true, ids: [] })
})

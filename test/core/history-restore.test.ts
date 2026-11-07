// 画面の履歴の段の置き直し（base の book-revert）: patchOf が 2 つのブックの違う所だけを片方の値にする値を作り、applyRestore が今のブックの上で行う。
// 置き直すページと最上位のアイテム（restoredPages）が、認可の所（permissionScope）と、置き直したあとに開くページを決める
// （値の置き直しそのものは core/patch.test.ts）
import { expect, test } from "bun:test"
import { type Patch, patchOf } from "../../web/src/core/patch"
import type { Book } from "../../web/src/core/schema/book"
import { HISTORY_RESTORE } from "../../web/src/plugins/base/history"
import { applyRestore, restoredPages } from "../../web/src/plugins/base/history/restore"

const item = (id: string, caption = id) => ({ id, item: "x", x: 0, y: 0, props: { caption } })
const book = (fields: Record<string, unknown>, pages: unknown[]) =>
  ({ type: "t", id: "b", title: "本", ...fields, pages }) as unknown as Book
const page = (id: string, items: unknown[], fields: Record<string, unknown> = {}) => ({
  id,
  title: id,
  ...fields,
  items,
})
const patch = (from: Book, to: Book) => patchOf(from, to) as Patch

test("ブックのフィールド・ページ・アイテムを、前の値に戻し、後の値にやり直す", () => {
  const before = book({ locked: true }, [page("p", [item("a"), item("b")]), page("q", [])])
  const after = book({ title: "別" }, [page("p", [item("a", "A"), item("c")]), page("r", [])])
  expect(applyRestore(after, patch(after, before))).toEqual(before)
  expect(applyRestore(before, patch(before, after))).toEqual(after)
})

test("置き直すページと最上位のアイテム: ページの中だけを変えたならそのアイテム、ページを足した・消したなら丸ごと", () => {
  const before = book({}, [page("p", [item("a"), item("b")]), page("q", [])])
  const after = book({}, [page("p", [item("a", "A"), item("b")]), page("r", [])])
  expect(restoredPages(patch(after, before))).toEqual([
    { id: "r", gone: true, items: undefined },
    { id: "p", gone: false, items: ["a"] },
    { id: "q", gone: false, items: undefined },
  ])
})

test("認可の所は、置き直すページが 1 つならそのページとアイテム、いくつもなら言わない", () => {
  const scope = HISTORY_RESTORE.permissionScope as (args: Patch) => unknown
  const before = book({}, [page("p", [item("a")]), page("q", [item("x")])])
  const one = book({}, [page("p", [item("a", "A")]), page("q", [item("x")])])
  const two = book({}, [page("p", [item("a", "A")]), page("q", [item("x", "X")])])
  expect(scope(patch(one, before))).toEqual({ page: "p", items: ["a"] })
  expect(scope(patch(two, before))).toEqual({})
})

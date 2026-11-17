// 画面の履歴の段の置き直し（base の history と、core/folders.ts の restoredTables）: 変えたページとフォルダごとの前後から、片方の値にする値（patchesToward）を作り、
// 今の表・一覧の上で行う（restoredTables・restoredLibrary）。行った後に、中身の無いエントリと、どの並びからもたどれないページ・フォルダを落とす。
// 置き直すページと最上位のアイテム（restoredPages）が、認可の所（permissionScope）を決める（値の置き直しそのものは core/patch.test.ts）
import { expect, test } from "bun:test"
import {
  changesBetween,
  type RowPatches,
  restoredTables,
  type TableChanges,
  type Tables,
  tablesOf,
} from "../../../web/src/core/folders"
import type { RowChange } from "../../../web/src/core/history"
import { REMOVED } from "../../../web/src/core/records"
import type { Book } from "../../../web/src/core/schema/book"
import { HISTORY_RESTORE } from "../../../web/src/plugins/base/history"
import {
  patchesToward,
  type RevertArgs,
  restoredLibrary,
  restoredPages,
} from "../../../web/src/plugins/base/history/restore"

const item = (id: string, caption = id) => ({ id, item: "x", x: 0, y: 0, props: { caption } })
const book = (fields: Record<string, unknown>, lineup: unknown[], id = "b") =>
  ({ id, title: "本", ...fields, lineup }) as unknown as Book
const page = (id: string, items: unknown[], fields: Record<string, unknown> = {}) => ({
  kind: "page",
  id,
  type: "t",
  title: id,
  ...fields,
  items,
})
const binder = (id: string, lineup: unknown[], title = id) => ({ kind: "binder", id, title, pageType: "t", lineup })

// ブック from を to にした変わりの、ページとフォルダごとの前と後（画面の履歴の段が持つ形）
function rows(from: Book, to: Book) {
  const was = tablesOf([from])
  const changes = changesBetween([from], [to])
  const of = <T>(table: Readonly<Record<string, T>>, put: TableChanges["pages"] | TableChanges["folders"]) =>
    Object.fromEntries(
      Object.entries(put).map(([id, v]): [string, RowChange<T>] => [
        id,
        { before: table[id] ?? "none", after: v === REMOVED ? "none" : (v as T) },
      ]),
    )
  return { pages: of(was.pages, changes.pages), folders: of(was.folders, changes.folders) }
}
// ブック from を to にした段を、side の側へ置き直す値
const toward = (from: Book, to: Book, side: "before" | "after"): RowPatches => {
  const r = rows(from, to)
  return { pages: patchesToward(r.pages, side), folders: patchesToward(r.folders, side) }
}
const applied = (now: Book, patches: RowPatches): Tables => restoredTables(tablesOf([now]), patches)

test("ブックのフィールド・ページ・アイテムを、前の値に戻し、後の値にやり直す", () => {
  const before = book({ locked: true }, [page("p", [item("a"), item("b")]), page("q", [])])
  const after = book({ title: "別" }, [page("p", [item("a", "A"), item("c")]), page("r", [])])
  expect(applied(after, toward(before, after, "before"))).toEqual(tablesOf([before]))
  expect(applied(before, toward(before, after, "after"))).toEqual(tablesOf([after]))
})

test("何も変えない置き直しは、同じ表を返す", () => {
  const now = book({}, [page("p", [item("a")])])
  const tables = tablesOf([now])
  expect(restoredTables(tables, { pages: {}, folders: {} })).toBe(tables)
})

test("バインダの中のページと、バインダの名前を置き直す", () => {
  const before = book({}, [binder("f", [page("s", [item("a")])])])
  const changed = book({}, [binder("f", [page("s", [item("a", "A")])], "別")])
  expect(applied(changed, toward(before, changed, "before"))).toEqual(tablesOf([before]))
})

test("ページを戻す先のバインダが、その間に無くなっていたら、ページは戻さない（どの並びからもたどれないページは落とす）", () => {
  const before = book({}, [page("p", []), binder("f", [page("s", []), page("t", [])])])
  const after = book({}, [page("p", []), binder("f", [page("s", [])])])
  const now = book({}, [page("p", [])])
  expect(applied(now, toward(before, after, "before"))).toEqual(tablesOf([now]))
})

test("バインダを無くす置き直しは、その間にそのバインダに足されたページも無くす", () => {
  const before = book({}, [page("p", [])])
  const after = book({}, [page("p", []), binder("f", [page("s", [])])])
  const now = book({}, [page("p", []), binder("f", [page("s", []), page("x", [])])])
  expect(applied(now, toward(before, after, "before"))).toEqual(tablesOf([before]))
})

test("中身のページが表に無いエントリは、並びから外す", () => {
  const now = book({}, [page("p", [])])
  const tables = restoredTables(tablesOf([now]), {
    pages: {},
    folders: {
      b: { fields: { lineup: { list: [{ id: "gone", index: 1, patch: { set: { kind: "page", id: "gone" } } }] } } },
    },
  })
  expect(tables).toEqual(tablesOf([now]))
})

test("一覧の置き直しは、名指したブックだけを変え、ほかのブックは同じ値のまま。名指したブックが無い・ゴミ箱に在るなら断る", () => {
  const before = book({}, [page("p", [item("a")])])
  const after = book({}, [page("p", [item("a", "A")])])
  const other = book({}, [page("o", [])], "c")
  const patches = toward(before, after, "before")
  const next = restoredLibrary({ b: after, c: other }, ["b"], patches)
  expect(next?.b).toEqual(before)
  expect(next?.c).toBe(other)
  expect(restoredLibrary({ c: other }, ["b"], patches)).toBeNull()
  expect(
    restoredLibrary({ b: { ...after, trashed: "2026-01-01T00:00:00Z" } as Book, c: other }, ["b"], patches),
  ).toBeNull()
  // 名指していないブックの物を変える置き直しは断る
  expect(restoredLibrary({ b: after, c: other }, ["c"], patches)).toBeNull()
})

test("2 冊のブックを 1 回で置き直す", () => {
  const b0 = book({}, [page("p", [item("a")])])
  const b1 = book({}, [page("p", [item("a", "A")])])
  const c0 = book({}, [page("o", [])], "c")
  const c1 = book({ title: "別" }, [page("o", [])], "c")
  const one = toward(b0, b1, "before")
  const two = toward(c0, c1, "before")
  const patches = { pages: { ...one.pages, ...two.pages }, folders: { ...one.folders, ...two.folders } }
  expect(restoredLibrary({ b: b1, c: c1 }, ["b", "c"], patches)).toEqual({ b: b0, c: c0 })
})

test("置き直すページと最上位のアイテム: ページの中だけを変えたならそのアイテム、ページを足した・消したなら丸ごと", () => {
  const before = book({}, [page("p", [item("a"), item("b")]), page("q", [])])
  const after = book({}, [page("p", [item("a", "A"), item("b")]), page("r", [])])
  expect(restoredPages(toward(before, after, "before").pages)).toEqual([
    { id: "p", items: ["a"] },
    { id: "r", items: undefined },
    { id: "q", items: undefined },
  ])
})

test("認可の所は、変えるブックが 1 冊で置き直すページが 1 つならそのページとアイテム、いくつもなら言わない", () => {
  const scope = HISTORY_RESTORE.permissionScope as (args: RevertArgs) => unknown
  const before = book({}, [page("p", [item("a")]), page("q", [item("x")])])
  const one = book({}, [page("p", [item("a", "A")]), page("q", [item("x")])])
  const two = book({}, [page("p", [item("a", "A")]), page("q", [item("x", "X")])])
  const renamed = book({}, [{ ...page("p", [item("a")]), title: "別" }, page("q", [])])
  const args = (to: Book, books = ["b"]): RevertArgs => ({ books, ...toward(before, to, "before") })
  expect(scope(args(one))).toEqual({ books: [{ book: "b", where: { page: "p", items: ["a"] } }], creates: false })
  expect(scope(args(two))).toEqual({ books: [{ book: "b", where: {} }], creates: false })
  expect(scope(args(one, ["b", "c"]))).toEqual({
    books: [
      { book: "b", where: {} },
      { book: "c", where: {} },
    ],
    creates: false,
  })
  // ページの名前だけの置き直しも、そのページを認可の所にする
  expect(
    scope({
      books: ["b"],
      ...toward(before, { ...renamed, lineup: [renamed.lineup[0]!, before.lineup[1]!] }, "before"),
    }),
  ).toEqual({
    books: [{ book: "b", where: { page: "p", items: [] } }],
    creates: false,
  })
})

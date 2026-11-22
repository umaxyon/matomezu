// 画面の履歴の段の置き直し（base の history と、core/folders-restore.ts の restoredTables）: 変えたページとフォルダごとの前後から、片方の値にする値（patchesToward）を作り、
// 今の表・一覧の上で行う（restoredTables・restoredBooks）。段が書いた所がその間に変わっていれば断る。行った後に、中身の無いエントリと、
// どの並びからもたどれないページ・フォルダを落とす。
// 置き直すページと最上位のアイテム（restoredPages）が、認可の所（permissionScope）を決める（値の置き直しそのものは core/patch.test.ts）
import { expect, test } from "bun:test"
import { trashedEntry } from "../../../web/src/core/entries"
import { HOME_ID, type HomeFolder, homeOver, type Library, type TableChanges } from "../../../web/src/core/folders"
import { bookOf, tablesOf } from "../../../web/src/core/folders-books"
import { changesBetween } from "../../../web/src/core/folders-changes"
import { type RowPatches, restoredTables } from "../../../web/src/core/folders-restore"
import type { RowChange } from "../../../web/src/core/history"
import { REMOVED } from "../../../web/src/core/records"
import type { AnyPage, Book } from "../../../web/src/core/schema/book"
import { HISTORY_RESTORE } from "../../../web/src/plugins/base/history"
import {
  patchesToward,
  type RevertArgs,
  restoredBooks,
  restoredLibrary,
  restoredPages,
} from "../../../web/src/plugins/base/history/restore"
import { libraryWith, worldTablesOf } from "../../support"

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
// ステージエントリのブック b
const B = { kind: "book", id: "b" } as const
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
const applied = (now: Book, patches: RowPatches): Library => restoredTables(tablesOf([now]), patches) as Library

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

test("ページを戻す先のバインダが、その間に無くなっていたら、ぶつかって断る", () => {
  const before = book({}, [page("p", []), binder("f", [page("s", []), page("t", [])])])
  const after = book({}, [page("p", []), binder("f", [page("s", [])])])
  const now = book({}, [page("p", [])])
  expect(restoredTables(tablesOf([now]), toward(before, after, "before"))).toBeNull()
})

test("バインダを無くす置き直しは、その間にそのバインダにページが足されていたら、ぶつかって断る", () => {
  const before = book({}, [page("p", [])])
  const after = book({}, [page("p", []), binder("f", [page("s", [])])])
  const now = book({}, [page("p", []), binder("f", [page("s", []), page("x", [])])])
  expect(restoredTables(tablesOf([now]), toward(before, after, "before"))).toBeNull()
})

test("段が書いた所のうち、もう置き直す側の値の所は飛ばし、反対側の値のままの所だけを置き直す。全部もう置き直す側なら、同じ表を返す", () => {
  const before = book({ title: "前" }, [page("p", [item("a")])])
  const after = book({ title: "後" }, [page("p", [item("a", "A")])])
  const half = book({ title: "前" }, [page("p", [item("a", "A")])])
  expect(applied(half, toward(before, after, "before"))).toEqual(tablesOf([before]))
  const tables = tablesOf([before])
  expect(restoredTables(tables, toward(before, after, "before"))).toBe(tables)
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
  const next = restoredBooks({ b: after, c: other }, ["b"], patches)
  expect(next?.b).toEqual(before)
  expect(next?.c).toBe(other)
  expect(restoredBooks({ c: other }, ["b"], patches)).toBeNull()
  // 書庫の置き直しは、名指したブックがゴミ箱に在れば断る
  const library = worldTablesOf([after, other], [homeOver([after, other])])
  expect(bookOf(restoredLibrary(library, [B], patches) as Library, "b")).toEqual(before)
  const binned = trashedEntry(library, "b", "2026-01-01T00:00:00.000Z") as Library
  expect(restoredLibrary(binned, [B], patches)).toBeNull()
  // 名指していないブックの物を変える置き直しは断る
  expect(restoredBooks({ b: after, c: other }, ["c"], patches)).toBeNull()
})

test("2 冊のブックを 1 回で置き直す", () => {
  const b0 = book({}, [page("p", [item("a")])])
  const b1 = book({}, [page("p", [item("a", "A")])])
  const c0 = book({}, [page("o", [])], "c")
  const c1 = book({ title: "別" }, [page("o", [])], "c")
  const one = toward(b0, b1, "before")
  const two = toward(c0, c1, "before")
  const patches = { pages: { ...one.pages, ...two.pages }, folders: { ...one.folders, ...two.folders } }
  expect(restoredBooks({ b: b1, c: c1 }, ["b", "c"], patches)).toEqual({ b: b0, c: c0 })
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
  const args = (to: Book, books = ["b"]): RevertArgs => ({
    outermosts: books.map(id => ({ kind: "book", id })),
    ...toward(before, to, "before"),
  })
  expect(scope(args(one))).toEqual({
    books: [{ book: "b", where: { page: "p", items: ["a"] } }],
    entries: [],
    creates: [],
  })
  expect(scope(args(two))).toEqual({ books: [{ book: "b", where: {} }], entries: [], creates: [] })
  expect(scope(args(one, ["b", "c"]))).toEqual({
    books: [
      { book: "b", where: {} },
      { book: "c", where: {} },
    ],
    entries: [],
    creates: [],
  })
  // ページの名前だけの置き直しも、そのページを認可の所にする
  expect(
    scope({
      outermosts: [B],
      ...toward(before, { ...renamed, lineup: [renamed.lineup[0]!, before.lineup[1]!] }, "before"),
    }),
  ).toEqual({
    books: [{ book: "b", where: { page: "p", items: [] } }],
    entries: [],
    creates: [],
  })
})

test("ブックの外のページを置き直す。名指していない物・どのステージエントリにも入らない行を変える置き直しと、名指した種類のとおりに在らない物は断る", () => {
  const b = book({}, [page("p", [item("a")])])
  const x0 = page("x", [item("a")]) as unknown as AnyPage
  const x1 = { ...x0, title: "改名" } as AnyPage
  const y = page("y", []) as unknown as AnyPage
  const library = libraryWith([b], [x1, y])
  const X = { kind: "page", id: "x" } as const
  const back: RowPatches = { pages: patchesToward({ x: { before: x0, after: x1 } }, "before"), folders: {} }
  const done = restoredLibrary(library, [X], back) as Library
  expect(done.pages.x).toEqual(x0)
  expect(done.pages.y).toBe(library.pages.y)
  expect(restoredLibrary(done, [X], back)).toBe("unchanged")
  // 名指した種類が違う・ブックの外のページでない・ゴミ箱の中
  expect(restoredLibrary(library, [{ kind: "book", id: "x" }], back)).toBeNull()
  expect(restoredLibrary(library, [{ kind: "page", id: "p" }], back)).toBeNull()
  expect(restoredLibrary(library, [{ kind: "page", id: "b" }], back)).toBeNull()
  const binned = trashedEntry(library, "x", "2026-01-01T00:00:00.000Z") as Library
  expect(restoredLibrary(binned, [X], back)).toBeNull()
  // 名指していないブックの外のページ・ブックを変える
  expect(restoredLibrary(library, [{ kind: "page", id: "y" }], back)).toBeNull()
  expect(restoredLibrary(library, [B], back)).toBeNull()
  // どのステージエントリにも入らない行（書庫ホーム）も変える
  const home = library.folders[HOME_ID] as HomeFolder
  const turned = { ...home, lineup: [...home.lineup].reverse() }
  const order = patchesToward({ [HOME_ID]: { before: home, after: turned } }, "after")
  expect(restoredLibrary(library, [X], { pages: back.pages, folders: order })).toBeNull()
  // 名指したページを無くす
  const gone: RowPatches = { pages: patchesToward({ x: { before: x1, after: "none" } }, "after"), folders: {} }
  expect(restoredLibrary(library, [X], gone)).toBeNull()
})

// ディレクトリ構成図を組み立てる計算（plugins/books/dir/edit.ts）と並べ方（layout.ts）: 足す・名前と色・消す・付け替える・開け閉め・並べ替え・パスから組み立てる、行と罫線
import { expect, test } from "bun:test"
import { dropAt } from "../../web/src/plugins/books/dir/drag"
import {
  addEntries,
  buildPaths,
  changeEntry,
  compareNames,
  entryOf,
  moveEntry,
  pathTo,
  removeEntry,
  rowsOf,
  setClosed,
  sortFolder,
} from "../../web/src/plugins/books/dir/edit"
import type { DirEntry, DirFolder } from "../../web/src/plugins/books/dir/entry"
import { giveIds } from "../../web/src/plugins/books/dir/entry"
import { ICON, INDENT, layoutDir, MARGIN, ROW } from "../../web/src/plugins/books/dir/layout"

// 根 r の中に フォルダ src（a.ts・ui（b.tsx））と README.md
const dir: DirFolder = {
  id: "r",
  kind: "folder",
  name: "proj",
  children: [
    {
      id: "src",
      kind: "folder",
      name: "src",
      children: [
        { id: "a", kind: "file", name: "a.ts" },
        { id: "ui", kind: "folder", name: "ui", children: [{ id: "b", kind: "file", name: "b.tsx" }] },
      ],
    },
    { id: "readme", kind: "file", name: "README.md" },
  ],
}
const ids = (f: DirEntry | null | undefined) => (f?.kind === "folder" ? (f.children ?? []).map(c => c.id) : [])
const file = (id: string): DirEntry => ({ id, kind: "file", name: id })

test("中身とそこまでのフォルダを根から辿れる（根も中身の 1 つ）", () => {
  expect(pathTo(dir, "r")).toEqual([])
  expect(pathTo(dir, "b")?.map(f => f.id)).toEqual(["r", "src", "ui"])
  expect(pathTo(dir, "x")).toBeNull()
  expect(entryOf(dir, "r")?.name).toBe("proj")
  expect(entryOf(dir, "b")?.name).toBe("b.tsx")
})

test("フォルダの中の決めた所（無ければ末尾）に足す。ファイルの中・範囲の外には足せない", () => {
  expect(ids(entryOf(addEntries(dir, "src", [file("n")])!, "src"))).toEqual(["a", "ui", "n"])
  expect(ids(entryOf(addEntries(dir, "src", [file("n")], 0)!, "src"))).toEqual(["n", "a", "ui"])
  expect(ids(addEntries(dir, "r", [file("n")], 1))).toEqual(["src", "n", "readme"])
  expect(addEntries(dir, "a", [file("n")])).toBeNull()
  expect(addEntries(dir, "src", [file("n")], 3)).toBeNull()
  expect(addEntries(dir, "x", [file("n")])).toBeNull()
})

test("名前と色を替える（根も）。色の null は消す", () => {
  const named = changeEntry(dir, "a", { name: "**main**.ts", color: "danger" })
  expect(entryOf(named!, "a")).toEqual({ id: "a", kind: "file", name: "**main**.ts", color: "danger" })
  expect(entryOf(changeEntry(named!, "a", { color: null })!, "a")).toEqual({
    id: "a",
    kind: "file",
    name: "**main**.ts",
  })
  expect(changeEntry(dir, "r", { name: "root" })?.name).toBe("root")
  expect(changeEntry(dir, "x", { name: "?" })).toBeNull()
})

test("中身ごと消す。根は消せない。空になったフォルダは中身を持たない", () => {
  expect(ids(removeEntry(dir, "src"))).toEqual(["readme"])
  expect(entryOf(removeEntry(dir, "b")!, "ui")).toEqual({ id: "ui", kind: "folder", name: "ui" })
  expect(removeEntry(dir, "r")).toBeNull()
})

test("付け替えと並びの入れ替え。根・ファイルの中・自分の中へは移せない", () => {
  expect(ids(moveEntry(dir, "readme", "r", 0))).toEqual(["readme", "src"])
  const moved = moveEntry(dir, "b", "r")
  expect(ids(moved)).toEqual(["src", "readme", "b"])
  expect(ids(entryOf(moved!, "ui"))).toEqual([])
  expect(moveEntry(dir, "r", "src")).toBeNull()
  expect(moveEntry(dir, "ui", "a")).toBeNull()
  expect(moveEntry(dir, "src", "ui")).toBeNull()
  expect(moveEntry(dir, "src", "src")).toBeNull()
})

test("フォルダを閉じると中身の行を出さない（根も閉じられる）。ファイルは閉じられない", () => {
  const closed = setClosed(dir, "src", true)!
  expect(rowsOf(closed).map(r => r.entry.id)).toEqual(["r", "src", "readme"])
  expect(entryOf(setClosed(closed, "src", false)!, "src")).not.toHaveProperty("closed")
  expect(rowsOf(setClosed(dir, "r", true)!).map(r => r.entry.id)).toEqual(["r"])
  expect(setClosed(dir, "a", true)).toBeNull()
  expect(rowsOf(dir).map(r => [r.entry.id, r.depth])).toEqual([
    ["r", 0],
    ["src", 1],
    ["a", 2],
    ["ui", 2],
    ["b", 3],
    ["readme", 1],
  ])
})

test("並べ替えは直下だけ、フォルダが先。名前は装飾の記号と大文字小文字を除き、数字は数の大きさで比べる", () => {
  const mixed: DirFolder = {
    id: "r",
    kind: "folder",
    name: "r",
    children: [
      { id: "f10", kind: "file", name: "file10" },
      { id: "z", kind: "folder", name: "Zeta", children: [file("y"), file("x")] },
      { id: "f2", kind: "file", name: "**file2**" },
      { id: "a", kind: "folder", name: "alpha" },
      { id: "B", kind: "file", name: "B" },
    ],
  }
  const asc = sortFolder(mixed, "r", "asc")!
  expect(ids(asc)).toEqual(["a", "z", "B", "f2", "f10"])
  expect(ids(entryOf(asc, "z"))).toEqual(["y", "x"]) // 中のフォルダはそのまま
  expect(ids(sortFolder(mixed, "r", "desc"))).toEqual(["z", "a", "f10", "f2", "B"])
  expect(sortFolder(mixed, "B", "asc")).toBeNull()
  expect(compareNames("a", "A")).toBeGreaterThan(0) // 同じなら字の符号で（どの環境でも同じ順）
  expect(compareNames("v1.2", "v1.10")).toBeLessThan(0)
})

test("パスの並びから組み立てる。末尾が / ならフォルダ、途中はフォルダ。同じ名前と種類の物は使い回し、同じパスを 2 度渡しても増えない", () => {
  let n = 0
  const makeId = () => `n${++n}`
  const built = buildPaths(dir, "r", ["src/ui/Button.tsx", "docs/", "src/a.ts", "LICENSE"], makeId)!
  expect(built.ids).toEqual(["n1", "n2", "a", "n3"])
  expect(ids(built.root)).toEqual(["src", "readme", "n2", "n3"])
  expect(ids(entryOf(built.root, "ui"))).toEqual(["b", "n1"])
  expect(entryOf(built.root, "n2")).toEqual({ id: "n2", kind: "folder", name: "docs" })
  const again = buildPaths(built.root, "r", ["src/ui/Button.tsx", "docs/"], makeId)!
  expect(again.root).toEqual(built.root)
  expect(again.ids).toEqual(["n1", "n2"])
  expect(buildPaths(dir, "a", ["x"], makeId)).toBeNull()
  expect(buildPaths(dir, "r", ["/"], makeId)).toBeNull()
  // 同じ名前のファイルがあっても、フォルダとしては別に足す
  expect(entryOf(buildPaths(dir, "r", ["README.md/"], makeId)!.root, "n4")).toMatchObject({ kind: "folder" })
})

test("足すときに受けた入れ子に上から id を振る。閉じているかはフォルダだけ", () => {
  let n = 0
  const given = giveIds(
    [{ kind: "folder", name: "lib", closed: true, children: [{ kind: "file", name: "x.ts", color: "blue" }] }],
    () => `g${++n}`,
  )
  expect(given.entries).toEqual([
    {
      id: "g1",
      kind: "folder",
      name: "lib",
      closed: true,
      children: [{ id: "g2", kind: "file", name: "x.ts", color: "blue" }],
    },
  ])
  expect(given.ids).toEqual([{ id: "g1", children: [{ id: "g2" }] }])
})

test("行は上から 1 行ずつ、深さごとに字下げ。罫線はフォルダのアイコンの真ん中から最後の中身まで縦に、中身ごとに横に引く。紙を超えれば収まらない", () => {
  const laid = layoutDir(dir, { w: 794, h: 1123 })
  const row = (id: string) => laid.rows.find(r => r.id === id)!
  expect(laid.rows.map(r => r.id)).toEqual(["r", "src", "a", "ui", "b", "readme"])
  expect(row("r")).toMatchObject({ x: MARGIN + INDENT, y: MARGIN })
  expect(row("a")).toMatchObject({ x: MARGIN + INDENT * 3, y: MARGIN + ROW * 2 })
  expect(row("src").toggle).toEqual({ x: MARGIN + INDENT + ICON / 2, y: MARGIN + ROW * 1.5 }) // 根の縦の罫線の上
  expect(row("a").toggle).toBeNull()
  // 根から README.md の行まで、根のアイコンの真ん中を縦に
  const x = MARGIN + INDENT + ICON / 2
  expect(laid.lines).toContainEqual({
    from: { x, y: MARGIN + ROW / 2 + ICON / 2 },
    to: { x, y: MARGIN + ROW * 5 + ROW / 2 },
  })
  expect(laid.lines.filter(l => l.from.y === l.to.y)).toHaveLength(5) // 根のほかの行ごとに横の線
  expect(laid.fits).toBe(true)
  expect(layoutDir(dir, { w: 794, h: MARGIN * 2 + ROW * 5 }).fits).toBe(false)
  expect(layoutDir(setClosed(dir, "src", true)!, { w: 794, h: MARGIN * 2 + ROW * 3 }).fits).toBe(true)
})

test("ドラッグで落とす先: フォルダの行の真ん中は中の末尾、上下の端は前後（開いたフォルダの下の端は中の先頭）。ファイルの行は上半分で前・下半分で後ろ。根は中へだけ。自分と中身の行には落とせない", () => {
  const rows = layoutDir(dir, { w: 794, h: 1123 }).rows
  const at = (id: string, t: number) => {
    const r = rows.find(x => x.id === id)!
    return { x: r.x + 4, y: r.y + r.h * t }
  }
  const where = (dragged: string, id: string, t: number) => {
    const d = dropAt(dir, rows, dragged, at(id, t))
    return d && { parent: d.parent, index: d.index, mark: d.mark.kind }
  }
  expect(where("readme", "ui", 0.5)).toEqual({ parent: "ui", index: undefined, mark: "into" })
  expect(where("readme", "ui", 0.1)).toEqual({ parent: "src", index: 1, mark: "between" })
  expect(where("readme", "ui", 0.9)).toEqual({ parent: "ui", index: 0, mark: "between" }) // 開いたフォルダの下の端は中の先頭
  expect(where("readme", "a", 0.4)).toEqual({ parent: "src", index: 0, mark: "between" })
  expect(where("readme", "a", 0.6)).toEqual({ parent: "src", index: 1, mark: "between" })
  expect(where("a", "r", 0.1)).toEqual({ parent: "r", index: undefined, mark: "into" })
  expect(where("src", "b", 0.5)).toBeNull() // 自分の中身の行
  expect(where("src", "src", 0.5)).toBeNull()
  expect(where("r", "readme", 0.5)).toBeNull() // 根は動かせない
  // 同じフォルダの中の並べ替えは、動かす物を除いた並びで数える
  expect(where("src", "readme", 0.9)).toEqual({ parent: "r", index: 1, mark: "between" })
})

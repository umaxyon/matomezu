// ツリーを組み立てる計算（plugins/books/tree/edit.ts）: 節を足す・キャプションを替える・子孫ごと消す、と、上下左右のキーで動いた先の節
import { expect, test } from "bun:test"
import {
  addNodes,
  afterRemove,
  captionNode,
  captionOf,
  centerShift,
  editEnd,
  moveFrom,
  PLUS_GAP,
  pathTo,
  plusesOf,
  plusPoint,
  removeNode,
  withCaption,
} from "../../web/src/plugins/books/tree/edit"

// 根 r の子 a（孫 a1・a2）と b
const tree = {
  id: "r",
  caption: "根",
  children: [
    {
      id: "a",
      caption: "A",
      children: [
        { id: "a1", caption: "A1" },
        { id: "a2", caption: "A2" },
      ],
    },
    { id: "b", caption: "B" },
  ],
}

test("pathTo は根からの親の並び（根は空、無い節は null）", () => {
  expect(pathTo(tree, "r")).toEqual([])
  expect(pathTo(tree, "a2")?.map(n => n.id)).toEqual(["r", "a"])
  expect(pathTo(tree, "x")).toBeNull()
})

test("addNodes は親の子の index の所（無ければ末尾）に足す。親が無い・index が範囲の外なら null", () => {
  const n = { id: "n", caption: "N" }
  expect(addNodes(tree, "a", [n])?.children?.[0]?.children?.map(c => c.id)).toEqual(["a1", "a2", "n"])
  expect(addNodes(tree, "a", [n], 1)?.children?.[0]?.children?.map(c => c.id)).toEqual(["a1", "n", "a2"])
  expect(addNodes(tree, "b", [n])?.children?.[1]).toEqual({ id: "b", caption: "B", children: [n] })
  expect(addNodes(tree, "r", [n], 0)?.children?.map(c => c.id)).toEqual(["n", "a", "b"])
  expect(addNodes(tree, "x", [n])).toBeNull()
  expect(addNodes(tree, "a", [n], 3)).toBeNull()
})

test("captionNode は子のキャプションだけを替える。根と無い節は null", () => {
  expect(captionNode(tree, "a1", "新")?.children?.[0]?.children?.[0]).toEqual({ id: "a1", caption: "新" })
  expect(captionNode(tree, "r", "新")).toBeNull()
  expect(captionNode(tree, "x", "新")).toBeNull()
})

test("removeNode は子孫ごと消し、子が無くなれば children も消す。根と無い節は null", () => {
  expect(removeNode(tree, "a")?.children?.map(c => c.id)).toEqual(["b"])
  const lone = removeNode(removeNode(tree, "a1")!, "a2")
  expect(lone?.children?.[0]).toEqual({ id: "a", caption: "A" })
  expect(removeNode(tree, "r")).toBeNull()
  expect(removeNode(tree, "x")).toBeNull()
})

test("afterRemove は前の兄弟、無ければ親", () => {
  expect(afterRemove(tree, "a2")).toBe("a1")
  expect(afterRemove(tree, "a1")).toBe("a")
  expect(afterRemove(tree, "b")).toBe("a")
  expect(afterRemove(tree, "r")).toBeNull()
})

test("下へ伸びる木: 下で最初の子、上で親、左右で隣の兄弟。動けなければそのまま", () => {
  expect(moveFrom(tree, "down", "r", "down")).toBe("a")
  expect(moveFrom(tree, "down", "a", "down")).toBe("a1")
  expect(moveFrom(tree, "down", "a1", "up")).toBe("a")
  expect(moveFrom(tree, "down", "a1", "right")).toBe("a2")
  expect(moveFrom(tree, "down", "a2", "left")).toBe("a1")
  expect(moveFrom(tree, "down", "a2", "right")).toBe("a2")
  expect(moveFrom(tree, "down", "b", "down")).toBe("b")
  expect(moveFrom(tree, "down", "r", "up")).toBe("r")
  expect(moveFrom(tree, "down", "r", "left")).toBe("r")
})

test("右へ・左へ・上へ・中央の木: 伸びる向きのキーで子へ、逆で親へ、横は上下（右・左・中央）か左右（上）で兄弟へ", () => {
  expect(moveFrom(tree, "right", "r", "right")).toBe("a")
  expect(moveFrom(tree, "right", "a", "down")).toBe("b")
  expect(moveFrom(tree, "right", "a", "left")).toBe("r")
  expect(moveFrom(tree, "left", "r", "left")).toBe("a")
  expect(moveFrom(tree, "left", "a", "right")).toBe("r")
  expect(moveFrom(tree, "up", "r", "up")).toBe("a")
  expect(moveFrom(tree, "up", "a", "right")).toBe("b")
  expect(moveFrom(tree, "center", "r", "right")).toBe("a")
  expect(moveFrom(tree, "center", "b", "up")).toBe("a")
})

test("centerShift は、紙の上の四角の真ん中をビューの真ん中に持ってくるずらす量（倍率込み）。1px 未満なら null", () => {
  expect(centerShift({ x: 100, y: 50, w: 40, h: 20 }, { w: 800, h: 600 }, { x: 10, y: 20, zoom: 2 })).toEqual({
    dx: 400 - (10 + 120 * 2),
    dy: 300 - (20 + 60 * 2),
  })
  expect(centerShift({ x: 0, y: 0, w: 100, h: 100 }, { w: 100, h: 100 }, { x: 0.4, y: 0, zoom: 1 })).toBeNull()
})

test("plusesOf: 根は伸びる向きの辺に子の＋だけ。子は、伸びる向きに子の＋、横の 2 辺に前と後ろの兄弟の＋（親の子の何番目に足すか）", () => {
  expect(plusesOf(tree, "down", "r")).toEqual([{ kind: "child", side: "down", parent: "r" }])
  expect(plusesOf(tree, "down", "a2")).toEqual([
    { kind: "child", side: "down", parent: "a2" },
    { kind: "before", side: "left", parent: "a", index: 1 },
    { kind: "after", side: "right", parent: "a", index: 2 },
  ])
  expect(plusesOf(tree, "right", "b").map(p => p.side)).toEqual(["right", "up", "down"])
  expect(plusesOf(tree, "center", "r")).toEqual([{ kind: "child", side: "right", parent: "r" }])
  expect(plusesOf(tree, "down", "x")).toEqual([])
})

test("editEnd: 空の子が空のまま終われば消す。今ある節を空にしたら何もしない。替われば根か子のキャプションを替える。取り消しは元のまま", () => {
  const withEmpty = addNodes(tree, "a", [{ id: "e", caption: "" }])!
  expect(editEnd(withEmpty, "e", "")).toEqual({ kind: "remove" })
  expect(editEnd(withEmpty, "e", null)).toEqual({ kind: "remove" })
  expect(editEnd(withEmpty, "e", "新")).toEqual({ kind: "child", caption: "新" })
  expect(editEnd(tree, "a1", "")).toEqual({ kind: "none" })
  expect(editEnd(tree, "a1", "A1")).toEqual({ kind: "none" })
  expect(editEnd(tree, "a1", null)).toEqual({ kind: "none" })
  expect(editEnd(tree, "r", "代表")).toEqual({ kind: "root", caption: "代表" })
  expect(editEnd(tree, "r", "")).toEqual({ kind: "none" })
})

test("captionOf・withCaption は根も子も扱い、plusPoint は辺の真ん中から外へ離した所", () => {
  expect(captionOf(tree, "r")).toBe("根")
  expect(captionOf(tree, "a2")).toBe("A2")
  expect(withCaption(tree, "r", "新").caption).toBe("新")
  expect(captionOf(withCaption(tree, "b", "新"), "b")).toBe("新")
  const rect = { x: 10, y: 20, w: 40, h: 30 }
  expect(plusPoint(rect, "down")).toEqual({ x: 30, y: 50 + PLUS_GAP })
  expect(plusPoint(rect, "left")).toEqual({ x: 10 - PLUS_GAP, y: 35 })
})

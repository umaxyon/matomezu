// データの置き直し（core/patch.ts）: patchOf は 2 つの値の違う所だけを置き直す値を作り、applyPatch が今の値の上で行う。
// オブジェクトはフィールドごと、id の並びは id ごと、改行を含む文字列は行ごと（ほかで変わった所は、重ならなければ残す）
import { expect, test } from "bun:test"
import { applyPatch, type Patch, patchOf, undoneIn } from "../../web/src/core/patch"

const back = (from: unknown, to: unknown, now: unknown) => applyPatch(now, patchOf(from, to) ?? { set: now })

test("同じなら置き直す値は無い", () => {
  expect(patchOf({ a: [{ id: "x" }] }, { a: [{ id: "x" }] })).toBeUndefined()
})

test("フィールドごと: 変えたフィールドだけを戻し、ほかで変わったフィールドは残す。無かったフィールドは外す", () => {
  const before = { props: { caption: "a", color: "red" } }
  const after = { props: { caption: "A", color: "red", extra: 1 } }
  const now = { props: { caption: "A", color: "blue", extra: 1 } }
  expect(back(after, before, now)).toEqual({ props: { caption: "a", color: "blue" } })
})

test("id の並び: 消した物は元の位置に、足した物は外し、中の子もフィールドごとにたどる。ほかで足した物は残す", () => {
  const before = {
    shapes: [
      { id: "a", x: 0 },
      { id: "b", x: 0, shapes: [{ id: "c", x: 0, y: 0 }] },
    ],
  }
  const after = {
    shapes: [
      { id: "b", x: 0, shapes: [{ id: "c", x: 5, y: 0 }] },
      { id: "d", x: 0 },
    ],
  }
  const now = {
    shapes: [
      { id: "b", x: 9, shapes: [{ id: "c", x: 5, y: 7 }] },
      { id: "d", x: 0 },
      { id: "ai", x: 0 },
    ],
  }
  expect(back(after, before, now)).toEqual({
    shapes: [
      { id: "a", x: 0 },
      { id: "b", x: 9, shapes: [{ id: "c", x: 0, y: 7 }] },
      { id: "ai", x: 0 },
    ],
  })
})

test("並び順だけの違いも戻す。ほかで足した物の場所は崩さない", () => {
  const before = { items: [{ id: "a" }, { id: "b" }, { id: "c" }] }
  const after = { items: [{ id: "c" }, { id: "a" }, { id: "b" }] }
  const now = { items: [{ id: "c" }, { id: "a" }, { id: "x" }, { id: "b" }] }
  expect(back(after, before, now)).toEqual({ items: [{ id: "a" }, { id: "b" }, { id: "x" }, { id: "c" }] })
})

test("行ごと: 自分が変えた行だけを戻し、ほかで書いた行は残す", () => {
  const before = "# 題\n一\n二\n三"
  const after = "# 題\n一\n自分\n二\n三"
  const now = "# 題\n一\n自分\n二\nAI\n三"
  expect(back(after, before, now)).toBe("# 題\n一\n二\nAI\n三")
})

test("行ごと: 消した行は元の所に戻し、すぐ隣にほかで足した行も残す", () => {
  const before = "一\n二\n三"
  const after = "一\n三"
  const now = "一\nAI\n三"
  expect(back(after, before, now)).toBe("一\n二\nAI\n三")
})

test("行ごと: 自分が変えた行をほかでも変えていたら、自分の Patch の値で上書きする", () => {
  const before = "一\n二\n三"
  const after = "一\n自分\n三"
  const now = "一\nAI\n三"
  expect(back(after, before, now)).toBe("一\n二\n三")
})

test("行ごと: やり直しも同じ（前から後へ）", () => {
  const before = "一\n二"
  const after = "一\n自分\n二"
  const now = "AI\n一\n二"
  expect(back(before, after, now)).toBe("AI\n一\n自分\n二")
})

test("行ごと: 離れた 2 か所の違いを、それぞれの所に当てる", () => {
  const before = "一\n二\n三\n四\n五"
  const after = "一\n自分1\n二\n三\n四\n自分2\n五"
  const now = "AI\n一\n自分1\n二\n三\n四\n自分2\n五"
  expect(back(after, before, now)).toBe("AI\n一\n二\n三\n四\n五")
})

// 消えたか: made（AI が書いた所）の値が、ある変更の前にはあって後に無い所
const lostIn = (base: unknown, ai: unknown, before: unknown, after: unknown) =>
  undoneIn(patchOf(base, ai) as Patch, before, after)

test("消えたか: フィールドは、AI の値が前にあって後に無いときだけ。前から違っていれば数えない", () => {
  const base = { props: { caption: "a" } }
  const ai = { props: { caption: "AI" } }
  expect(lostIn(base, ai, ai, base)).toEqual([{ at: "props/caption", value: "AI" }])
  expect(lostIn(base, ai, { props: { caption: "打ち直し" } }, base)).toEqual([])
  expect(lostIn(base, ai, ai, { props: { caption: "AI" }, x: 1 })).toEqual([])
})

test("消えたか: AI が足した物を外した・AI が外した物が戻ったら数える", () => {
  const base = { items: [{ id: "a" }] }
  const ai = { items: [{ id: "a" }, { id: "b" }] }
  expect(lostIn(base, ai, ai, base)).toEqual([{ at: "items/b", value: { id: "b" } }])
  expect(lostIn(ai, base, base, ai)).toEqual([{ at: "items/b", removed: true }])
})

test("消えたか: 行は、AI が書いた行が前の文字列にあって後に無いとき。同じ字の空行がほかにあっても取り違えない。AI が消した行が戻っても数える", () => {
  const base = "一\n\n二"
  const ai = "一\n\nAI\n\n二"
  expect(lostIn(base, ai, ai, base)).toEqual([{ at: "", lines: ["AI", ""] }])
  expect(lostIn(base, ai, ai, "一\n\nAI\n\n二\n\n")).toEqual([])
  expect(lostIn("一\n消す\n二", "一\n二", "一\n二", "一\n消す\n二")).toEqual([
    { at: "", lines: [], removedLines: ["消す"] },
  ])
})

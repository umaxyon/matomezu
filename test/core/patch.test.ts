// データの置き直し（core/patch.ts）: patchOf は 2 つの値の違う所だけを置き直す値を作り、applyPatch が今の値の上で行う。
// オブジェクトはフィールドごと、id の並びは id ごと、改行を含む文字列は行ごと（ほかで変わった所は、重ならなければ残す。重なる所を上書きするのは、
// バルクの中で同じ物をもう一度変えた分を重ねるとき（core/bulk.ts の joined）だけ。元に戻す・やり直すは toPutBack で確かめ、重なればぶつかりとして断る）。
// toPutBack は、今の値で所ごとに反対側の値のままかを確かめ、置き直す所だけにする（どちらの値でもない所が在れば CLASH）
import { expect, test } from "bun:test"
import { applyPatch, CLASH, type Patch, patchOf, toPutBack, undoneIn } from "../../web/src/core/patch"

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

test("並び順だけの違いも戻す。動かした物（c）だけを置き直し、ほかで足した物の場所は崩さない", () => {
  const before = { items: [{ id: "a" }, { id: "b" }, { id: "c" }] }
  const after = { items: [{ id: "c" }, { id: "a" }, { id: "b" }] }
  const now = { items: [{ id: "c" }, { id: "a" }, { id: "x" }, { id: "b" }] }
  expect(back(after, before, now)).toEqual({ items: [{ id: "a" }, { id: "x" }, { id: "b" }, { id: "c" }] })
})

test("並び順: 動かしていない物の順は、ほかで変えた順のまま残す。動かした物は、前後の動かしていない物との順を守る所へ置く", () => {
  const ids = (v: unknown) => (v as { items: { id: string }[] }).items.map(x => x.id)
  const items = (...xs: string[]) => ({ items: xs.map(id => ({ id })) })
  // 段は c を末尾から先頭へ動かした。その後ほかで a と b を入れ替えた。戻すと c だけが a・b の後ろへ戻る
  expect(ids(back(items("c", "a", "b"), items("a", "b", "c"), items("c", "b", "a")))).toEqual(["b", "a", "c"])
  // バルクの重ね方: 前後の決まりがぶつかる（m は a の後・b の前に戻るはずが、ほかで b が a の前に来た）ときは、前にあるべき a との順を取る
  // （元に戻す・やり直すでは、toPutBack がぶつかりとして断る）
  expect(ids(back(items("m", "a", "b"), items("a", "m", "b"), items("b", "m", "a")))).toEqual(["b", "a", "m"])
})

test("並び順: 1 本の履歴の中（今の値が from のまま）なら、足す・外す・並べ替えが混ざっても to になる", () => {
  const items = (...xs: string[]) => ({ items: xs.map(id => ({ id })) })
  const from = items("a", "b", "c", "d", "e")
  for (const to of [items("e", "d", "c", "b", "a"), items("x", "c", "a", "y", "e"), items("b", "z", "a", "d")])
    expect(back(from, to, from)).toEqual(to)
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

test("行ごと（バルクの重ね方）: 前の分の後の値で変わっていた行を今回の Patch も変えたら、今回の Patch の値で上書きする", () => {
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

// from を to にした段を置き直す（to の側から from の側へ）ときの、今の値 now での置き直す所
const putBack = (from: unknown, to: unknown, now: unknown) => toPutBack(now, patchOf(to, from) as Patch)

test("置き直す所: フィールドは、反対側の値のままなら置き直し、もう置き直す側なら飛ばし、どちらでもなければ CLASH。混ざれば反対側の所だけ", () => {
  const before = { title: "前", color: "red", gone: 1 }
  const after = { title: "後", color: "blue" }
  expect(putBack(before, after, after)).toEqual(patchOf(after, before))
  expect(putBack(before, after, before)).toBeUndefined()
  expect(putBack(before, after, { ...after, title: "ほか" })).toBe(CLASH)
  // title だけもう前の値: color と gone だけを置き直す
  const half = putBack(before, after, { title: "前", color: "blue" })
  expect(half).toEqual({ fields: { color: { set: "red", was: "blue" }, gone: { set: 1 } } })
  // 無かったフィールドを足す所に、ほかの値が在れば CLASH
  expect(putBack(before, after, { ...after, gone: 2 })).toBe(CLASH)
  // ほかで変わったのが段の変えていない所なら、確かめない
  expect(putBack(before, after, { ...after, other: 1 })).toEqual(patchOf(after, before))
})

test("置き直す所: id の並びは、足した・外した物を丸ごと確かめ、動かした物は、前後にある動かしていない物との順で確かめる", () => {
  const items = (...xs: (string | { id: string; v: number })[]) => ({
    items: xs.map(x => (typeof x === "string" ? { id: x } : x)),
  })
  // 段は c を末尾から先頭へ動かし、d を足した。戻すときの反対側は [c, a, b, d]
  const before = items("a", "b", "c")
  const after = items("c", "a", "b", "d")
  expect(putBack(before, after, items("c", "x", "a", "b", "d"))).toEqual(patchOf(after, before))
  // c が、段の前の所（b の後）にもう在れば、並びは飛ばし、d を外すだけ
  expect(putBack(before, after, items("a", "b", "c", "d"))).toEqual({
    fields: { items: { list: [{ id: "d", index: -1, patch: { absent: true, was: { id: "d" } } }] } },
  })
  // c が、どちらの所でもない（a と b の間）なら CLASH
  expect(putBack(before, after, items("a", "c", "b", "d"))).toBe(CLASH)
  // 足した d が変わっていれば CLASH、もう無ければ飛ばす
  expect(putBack(before, after, items("c", "a", "b", { id: "d", v: 1 }))).toBe(CLASH)
  expect(putBack(before, after, items("c", "a", "b"))).toMatchObject({ fields: { items: { moved: ["c"] } } })
})

test("置き直す所: 行の違いは、違いの所の反対側の行が今も続けて並んでいれば置き直し、ほかで書き換えられていれば CLASH", () => {
  const before = "一\n二\n三"
  const after = "一\n弐\n三"
  expect(putBack(before, after, "一\n弐\n三\n四")).toEqual({ text: { from: after, to: before } })
  expect(putBack(before, after, before)).toBeUndefined()
  expect(putBack(before, after, "一\nに\n三")).toBe(CLASH)
})

import { describe, expect, test } from "bun:test"
import { newStage, openPage, panBy, paperOf, placement, resize } from "../../web/src/core/stage"
import { contentSize, MARGIN } from "../../web/src/core/viewport"

describe("stage", () => {
  const stage = newStage("s1", "b1", "p1")
  const content = contentSize(paperOf(stage), 1)
  const small = { w: 400, h: 300 } // 中身が収まらない表示領域

  test("測る前は、ずらしても範囲に収めない（大きさが分からないので）", () => {
    expect(panBy(stage, -50, -60).pan).toEqual({ x: -50, y: -60 })
  })

  test("ずらす量は、いつも範囲に収めた値で持つ", () => {
    const s = resize(stage, small)
    expect(panBy(s, 100, 100).pan).toEqual({ x: 0, y: 0 })
    expect(panBy(s, -99999, -99999).pan).toEqual({ x: small.w - content.w, y: small.h - content.h })
  })

  test("表示領域が広がったら、ずらす量を収め直す（中身が収まれば真ん中）", () => {
    const panned = panBy(resize(stage, small), -200, -100)
    const wide = { w: content.w + 100, h: content.h + 40 }
    expect(resize(panned, wide).pan).toEqual({ x: 50, y: 20 })
  })

  test("同じ大きさ・動かない操作は、同じ値を返す", () => {
    const s = resize(stage, small)
    expect(resize(s, { ...small })).toBe(s)
    expect(panBy(s, 10, 10)).toBe(s)
    expect(openPage(s, "p1")).toBe(s)
  })

  test("ページを開くと、ずらす量は最初の位置に戻る", () => {
    const s = panBy(resize(stage, small), -200, -100)
    expect(openPage(s, "p2")).toMatchObject({ page: "p2", pan: { x: 0, y: 0 } })
  })

  test("紙は、ずらす量から余白の分だけ内側に置く", () => {
    const s = panBy(resize(stage, small), -30, -40)
    expect(placement(s)).toEqual({ x: MARGIN - 30, y: MARGIN - 40, ...paperOf(s), zoom: 1 })
  })
})

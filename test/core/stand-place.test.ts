// スタンドの置き場所（plugins/base/utils/stand-place.ts）: アンカーのどちら側に立て、入らなければどこへ回すか。上の辺が外に出たか・点を範囲に収める
import { describe, expect, test } from "bun:test"
import { pointInto, standAt, topOut, unionRect } from "../../web/src/plugins/base/utils/stand-place"

const area = { w: 400, h: 300 }
const size = { w: 100, h: 40 }

describe("スタンドの置き場所", () => {
  test("アンカーの下に、左端をそろえて少し離して立てる", () => {
    expect(standAt({ x: 50, y: 50, w: 80, h: 30 }, size, area, "below")).toEqual({ x: 50, y: 86 })
  })
  test("下に入らなければ上に回す", () => {
    expect(standAt({ x: 50, y: 250, w: 80, h: 30 }, size, area, "below")).toEqual({ x: 50, y: 204 })
  })
  test("どちらにも入らなければ、頼んだ側のまま、置ける範囲に収める", () => {
    expect(standAt({ x: 50, y: 10, w: 80, h: 280 }, size, area, "below")).toEqual({ x: 50, y: 256 })
  })
  test("右に立てるときは上端をそろえ、右に入らなければ左に回す", () => {
    expect(standAt({ x: 50, y: 50, w: 80, h: 30 }, size, area, "right")).toEqual({ x: 136, y: 50 })
    expect(standAt({ x: 330, y: 50, w: 60, h: 30 }, size, area, "right")).toEqual({ x: 224, y: 50 })
  })
  test("角に立てるときは真ん中を右上の角に、辺に乗せるときは左端をそろえて上の辺に置く", () => {
    expect(standAt({ x: 50, y: 50, w: 80, h: 30 }, { w: 20, h: 20 }, area, "corner")).toEqual({ x: 120, y: 40 })
    expect(standAt({ x: 50, y: 50, w: 80, h: 30 }, { w: 80, h: 14 }, area, "edge")).toEqual({ x: 50, y: 36 })
  })
  test("いくつものアンカーは、まとめて囲む四角のそばに立てる", () => {
    expect(
      unionRect([
        { x: 10, y: 20, w: 30, h: 30 },
        { x: 100, y: 5, w: 20, h: 20 },
      ]),
    ).toEqual({ x: 10, y: 5, w: 110, h: 45 })
  })
})

describe("画面の外に出たアンカー", () => {
  test("上の辺が置ける範囲と重ならなければ外（物の一部が見えていても、上の辺が外なら外）", () => {
    expect(topOut({ x: 50, y: 50, w: 80, h: 30 }, area)).toBe(false)
    expect(topOut({ x: 50, y: -10, w: 80, h: 30 }, area)).toBe(true)
    expect(topOut({ x: 50, y: 310, w: 80, h: 30 }, area)).toBe(true)
    expect(topOut({ x: -100, y: 50, w: 80, h: 30 }, area)).toBe(true)
    expect(topOut({ x: -40, y: 50, w: 80, h: 30 }, area)).toBe(false) // 上の辺の一部が見えている
    expect(topOut({ x: 420, y: 50, w: 80, h: 30 }, area)).toBe(true)
  })
  test("点を、置ける範囲の端から pad の内側に収める（範囲の中ならそのまま）", () => {
    expect(pointInto({ x: 100, y: 100 }, area, 16)).toEqual({ x: 100, y: 100 })
    expect(pointInto({ x: -50, y: 100 }, area, 16)).toEqual({ x: 16, y: 100 })
    expect(pointInto({ x: 500, y: -20 }, area, 16)).toEqual({ x: 384, y: 16 })
    expect(pointInto({ x: 100, y: 900 }, area, 16)).toEqual({ x: 100, y: 284 })
  })
})

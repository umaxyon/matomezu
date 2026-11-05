// スタンドの置き場所（plugins/base/utils/stand-place.ts）: アンカーのどちら側に立て、入らなければどこへ回すか。上の辺が外に出たか・点を範囲に収める
import { describe, expect, test } from "bun:test"
import {
  intersectRect,
  pointInto,
  revealShift,
  standAt,
  topEdgeOut,
  unionRect,
} from "../../web/src/plugins/base/utils/stand-place"

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
  const box = { x: 0, y: 0, ...area }
  test("上の辺が置ける範囲と重ならなければ外（物の一部が見えていても、上の辺が外なら外）", () => {
    expect(topEdgeOut({ x: 50, y: 50, w: 80, h: 30 }, box)).toBe(false)
    expect(topEdgeOut({ x: 50, y: -10, w: 80, h: 30 }, box)).toBe(true)
    expect(topEdgeOut({ x: 50, y: 310, w: 80, h: 30 }, box)).toBe(true)
    expect(topEdgeOut({ x: -100, y: 50, w: 80, h: 30 }, box)).toBe(true)
    expect(topEdgeOut({ x: -40, y: 50, w: 80, h: 30 }, box)).toBe(false) // 上の辺の一部が見えている
    expect(topEdgeOut({ x: 420, y: 50, w: 80, h: 30 }, box)).toBe(true)
  })
  test("見せるときのずらす量: 上に辺のスタンド（鳥）の分の余白 52px を足した四角の真ん中を、範囲の真ん中へ。範囲より大きい向きは、端から 4px の所に上の辺（左の辺。上は余白を足した所）をそろえる", () => {
    expect(revealShift({ x: 50, y: -200, w: 80, h: 40 }, area)).toEqual({ x: 110, y: 356 })
    expect(revealShift({ x: 500, y: 100, w: 80, h: 40 }, area)).toEqual({ x: -340, y: 56 })
    expect(revealShift({ x: 50, y: -200, w: 80, h: 500 }, area)).toEqual({ x: 110, y: 256 })
    // 余白を足さなければ、物の四角だけで決める
    expect(revealShift({ x: 50, y: -200, w: 80, h: 500 }, area, 4, 0)).toEqual({ x: 110, y: 204 })
  })
  test("点を、置ける範囲の端から pad の内側に収める（範囲の中ならそのまま）", () => {
    expect(pointInto({ x: 100, y: 100 }, box, 16)).toEqual({ x: 100, y: 100 })
    expect(pointInto({ x: -50, y: 100 }, box, 16)).toEqual({ x: 16, y: 100 })
    expect(pointInto({ x: 500, y: -20 }, box, 16)).toEqual({ x: 384, y: 16 })
    expect(pointInto({ x: 100, y: 900 }, box, 16)).toEqual({ x: 100, y: 284 })
    expect(pointInto({ x: 100, y: 900 }, { x: 40, y: 60, w: 100, h: 100 }, 16)).toEqual({ x: 100, y: 144 })
  })
  test("見える所がスクロールする物（リストの行の並び）の中なら、上の辺がその物の外に出たら外", () => {
    const rows = { x: 50, y: 100, w: 200, h: 120 }
    expect(topEdgeOut({ x: 60, y: 150, w: 180, h: 30 }, rows)).toBe(false)
    expect(topEdgeOut({ x: 60, y: 240, w: 180, h: 30 }, rows)).toBe(true) // リストの下に隠れた行
    expect(topEdgeOut({ x: 60, y: 80, w: 180, h: 30 }, rows)).toBe(true) // リストの上に隠れた行
  })
  test("四角の重なり（重ならなければ大きさ 0）", () => {
    expect(intersectRect({ x: 0, y: 0, w: 100, h: 100 }, { x: 50, y: -20, w: 100, h: 60 })).toEqual({
      x: 50,
      y: 0,
      w: 50,
      h: 40,
    })
    expect(intersectRect({ x: 0, y: 0, w: 100, h: 100 }, { x: 200, y: 0, w: 10, h: 10 })).toMatchObject({ w: 0 })
  })
})

// スタンドの置き場所（plugins/base/utils/stand-place.ts）: アンカーのどちら側に立て、入らなければどこへ回すか
import { describe, expect, test } from "bun:test"
import { standAt, unionRect } from "../../web/src/plugins/base/utils/stand-place"

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
  test("いくつものアンカーは、まとめて囲む四角のそばに立てる", () => {
    expect(
      unionRect([
        { x: 10, y: 20, w: 30, h: 30 },
        { x: 100, y: 5, w: 20, h: 20 },
      ]),
    ).toEqual({ x: 10, y: 5, w: 110, h: 45 })
  })
})

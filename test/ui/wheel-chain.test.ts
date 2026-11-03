// ホイールを受ける物（base の stage/wheel-chain.ts）: 一続きの回しは始めに決めた物が受け、手を止めてから回すと決め直す
import { expect, test } from "bun:test"
import { scrollsToward, WHEEL_GAP, wheelTaker } from "../../web/src/plugins/base/stage/wheel-chain"

test("回した向きへまだスクロールできるか: 上の端で上へ・下の端で下へはできない。途中ならどちらへもできる", () => {
  const top = { scroll: 0, content: 300, seen: 100 }
  const middle = { scroll: 80, content: 300, seen: 100 }
  const bottom = { scroll: 200, content: 300, seen: 100 }
  expect(scrollsToward(top, -1)).toBe(false)
  expect(scrollsToward(top, 1)).toBe(true)
  expect(scrollsToward(middle, -1)).toBe(true)
  expect(scrollsToward(middle, 1)).toBe(true)
  expect(scrollsToward(bottom, 1)).toBe(false)
  expect(scrollsToward(bottom, -1)).toBe(true)
  expect(scrollsToward({ scroll: 199.6, content: 300, seen: 100 }, 1)).toBe(false) // 倍率で出る端数の位置も端
  expect(scrollsToward(middle, 0)).toBe(false)
  expect(scrollsToward({ scroll: 0, content: 100, seen: 100 }, 1)).toBe(false) // スクロールしない物
})

test("回しを受ける物: 始めはスクロールできる物があればその物、無ければステージ。一続きの間は始めの物のまま、間を置いたら決め直す", () => {
  expect(wheelTaker(null, 1000, true)).toBe("inner")
  expect(wheelTaker(null, 1000, false)).toBe("stage")
  // 中の物が端に着いても、一続きの回しは中の物が受ける（紙は動かない）
  expect(wheelTaker({ taker: "inner", at: 1000 }, 1000 + WHEEL_GAP - 1, false)).toBe("inner")
  // 手を止めてから回すと、端に着いた物は受けず、ステージが受ける
  expect(wheelTaker({ taker: "inner", at: 1000 }, 1000 + WHEEL_GAP, false)).toBe("stage")
  // 紙をずらしている一続きの回しの間は、ポインタの下にスクロールできる物が来ても紙のまま
  expect(wheelTaker({ taker: "stage", at: 1000 }, 1100, true)).toBe("stage")
  expect(wheelTaker({ taker: "stage", at: 1000 }, 1000 + WHEEL_GAP, true)).toBe("inner")
})

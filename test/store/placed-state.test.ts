// 場所に入れる画面の状態（store/placed-state.ts）: 置き場のうち take が返す部分だけを場所に入れ、put で今の置き場に戻す
import { expect, test } from "bun:test"
import { z } from "zod"
import type { PlacedStateDef } from "../../web/src/core/def/placed-state"
import { putPlaced, takePlaced } from "../../web/src/store/placed-state"

// 置き場 { keep, temp } のうち keep だけを場所に入れ、戻すときは temp を残す。keep が "drop" なら置き場を消す
const PART: PlacedStateDef<string> = {
  schema: z.string(),
  take: state => (state as { keep?: string }).keep,
  put: (placed, state) =>
    placed === "drop" ? undefined : { ...(state as object), ...(placed === undefined ? {} : { keep: placed }) },
}
const defs = new Map<string, PlacedStateDef>([["@x/part", PART]])

test("take で置き場の一部だけが場所に入り、put で今の置き場に戻すと場所に入れない部分は残る", () => {
  const states = { "@x/part": { keep: "a", temp: 1 }, "@x/other": { any: true } }
  expect(takePlaced(defs, states)).toEqual({ "@x/part": "a" })
  expect(putPlaced(defs, { "@x/part": { keep: "a", temp: 2 }, "@x/other": 3 }, { "@x/part": "b" })).toEqual({
    "@x/part": { keep: "b", temp: 2 },
    "@x/other": 3,
  })
  // 形に合わない値は無いものとして put に渡す
  expect(putPlaced(defs, { "@x/part": { keep: "a", temp: 2 } }, { "@x/part": 5 })).toEqual({
    "@x/part": { keep: "a", temp: 2 },
  })
})

test("put が undefined を返すと置き場を消す", () => {
  expect(putPlaced(defs, { "@x/part": { keep: "a" } }, { "@x/part": "drop" })).toEqual({})
})

// 中身をずらしたときの線（items/line/shift.ts の shiftLines）: 手で直した途中の区間の位置（via）も、出る辺と交わる向きから x と y を交互にずらす
import { expect, test } from "bun:test"
import type { PortArea } from "../../web/src/plugins/base"
import { shiftLines } from "../../web/src/plugins/items/line/shift"

const line = (props: Record<string, unknown>) => ({
  id: "l",
  item: "@matomezu/line:connector-line",
  from: "a",
  to: "b",
  props,
})
const areas = new Map<string, PortArea>([
  ["a", { x: 0, y: 0, w: 100, h: 50 }],
  ["b", { x: 300, y: 200, w: 100, h: 50 }],
])

test("via の無い線はそのまま。via は交互に x と y の分だけずれる", () => {
  const plain = line({})
  expect(shiftLines([plain], areas, { x: 10, y: 1000 })[0]).toBe(plain)
  const [moved] = shiftLines([line({ exitAt: 0.1, enterAt: 0.6, via: [150, 120, 250] })], areas, { x: 10, y: 1000 })
  const via = moved?.props.via as number[]
  const steps = via.map((v, i) => v - ([150, 120, 250][i] as number))
  expect([10, 1000]).toContain(steps[0] as number)
  expect(steps).toEqual(steps[0] === 10 ? [10, 1000, 10] : [1000, 10, 1000])
})

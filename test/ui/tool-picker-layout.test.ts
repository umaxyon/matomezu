// 右ボタンの長押しの道具のアイコンとミニマップの置き方（base/tool-picker/layout.ts）: ミニマップは並びの外側（ポインタと反対の側）に並びと一緒に置き、
// 入らなければ出さない。離れたかは、アイコンとミニマップを合わせた枠から測る。開閉（core/stage.ts）
import { describe, expect, test } from "bun:test"
import type { Point, Rect } from "../../web/src/core/geom"
import { closePicker, newStage, openBook, openPicker } from "../../web/src/core/stage"
import {
  ICON,
  leftBox,
  leftPicker,
  type PickerLayout,
  pickerSlots,
} from "../../web/src/plugins/base/tool-picker/layout"
import { CORE_CATALOG } from "../support"

const view = { w: 1200, h: 800 }
const map = { w: 170, h: 150 }
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const icons = (l: PickerLayout) => l.slots.map(s => ({ x: s.x, y: s.y, w: ICON, h: ICON }))
// ミニマップが画面に収まり、アイコンにもポインタにも重ならない
const clear = (l: PickerLayout, at: Point, size = view) => {
  const m = l.map
  if (!m) return
  expect(m.x).toBeGreaterThanOrEqual(6)
  expect(m.y).toBeGreaterThanOrEqual(6)
  expect(m.x + m.w).toBeLessThanOrEqual(size.w - 6)
  expect(m.y + m.h).toBeLessThanOrEqual(size.h - 6)
  for (const b of icons(l)) expect(overlaps(m, b)).toBe(false)
  expect(overlaps(m, { x: at.x - 1, y: at.y - 1, w: 2, h: 2 })).toBe(false)
}

test("開くと出す所だけを持ち、閉じれば消える", () => {
  const paged = {
    type: "@matomezu/drawing:drawing" as const,
    id: "b1",
    title: "見本",
    project: "default",
    pages: [{ id: "p1", title: "1", paper: "@matomezu/base:a4", orientation: "landscape" as const }],
  }
  const picked = openPicker(openBook(CORE_CATALOG, newStage("s1"), paged), { x: 10, y: 20 })
  expect(picked.picker).toEqual({ at: { x: 10, y: 20 } })
  expect(closePicker(picked).picker).toBeNull()
})

describe("ミニマップの置き場所", () => {
  test("横並びはポインタの上に並べ、ミニマップはその上の真ん中", () => {
    const at = { x: 600, y: 400 }
    const l = pickerSlots(at, 3, map, view)
    expect(l.lay).toBe("row")
    expect(l.slots[0]!.y).toBe(400 - 16 - ICON)
    expect(l.map).toEqual({ x: 600 - 85, y: 400 - 16 - ICON - 6 - 150, ...map })
    clear(l, at)
  })
  test("ミニマップまで上に入らなければ、アイコンもミニマップも下へ（アイコンだけなら上に入る所でも）", () => {
    const at = { x: 600, y: 150 }
    const l = pickerSlots(at, 3, map, view)
    expect(l.slots[0]!.y).toBe(150 + 16)
    expect(l.map?.y).toBe(150 + 16 + ICON + 6)
    clear(l, at)
  })
  test("横並びで画面の端に近ければ、ミニマップは真ん中からずれて内へ寄る", () => {
    const at = { x: 80, y: 400 }
    const l = pickerSlots(at, 3, map, view)
    expect(l.lay).toBe("row")
    expect(l.map?.x).toBe(6)
    clear(l, at)
  })
  test("縦並びは、列の外側の横に、列の真ん中にそろえて置く", () => {
    const right = { x: 1190, y: 400 }
    const l = pickerSlots(right, 3, map, view)
    expect(l.lay).toBe("left")
    const col = l.slots[0]!.x
    expect(l.map?.x).toBe(col - 6 - map.w)
    const ys = l.slots.map(s => s.y)
    expect(l.map!.y + map.h / 2).toBe((Math.min(...ys) + Math.max(...ys) + ICON) / 2)
    clear(l, right)
    const left = { x: 10, y: 400 }
    const r = pickerSlots(left, 3, map, view)
    expect(r.lay).toBe("right")
    expect(r.map?.x).toBe(r.slots[0]!.x + ICON + 6)
    clear(r, left)
  })
  test("上にも下にも入らない低い窓では、ミニマップは出さず、アイコンだけを並べる", () => {
    const low = { w: 1200, h: 300 }
    const at = { x: 600, y: 150 }
    const l = pickerSlots(at, 3, map, low)
    expect(l.map).toBeNull()
    expect(l.slots[0]!.y).toBe(150 - 16 - ICON)
    const top = pickerSlots({ x: 600, y: 60 }, 3, map, low) // アイコンも上に 1 段分入らなければ下
    expect(top.slots[0]!.y).toBe(60 + 16)
  })
  test("縦並びで横に入らない狭い窓でも、ミニマップは出さない", () => {
    const narrow = { w: 200, h: 800 }
    expect(pickerSlots({ x: 190, y: 400 }, 3, map, narrow).map).toBeNull()
  })
  test("どこで開いても、ミニマップは画面に収まり、アイコンにもポインタにも重ならない", () => {
    for (const x of [10, 80, 300, 600, 1120, 1190])
      for (const y of [10, 100, 200, 400, 600, 790]) clear(pickerSlots({ x, y }, 4, map, view), { x, y })
  })
  test("組の初めの道具は並びの真ん中、ほかは組の順で残りの所", () => {
    const xs = pickerSlots({ x: 600, y: 400 }, 3, map, view).slots.map(s => s.x)
    expect(xs[1]! < xs[0]! && xs[0]! < xs[2]!).toBe(true)
    const ys = pickerSlots({ x: 1190, y: 400 }, 4, map, view).slots.map(s => s.y)
    expect(ys[1]! < ys[0]! && ys[0]! < ys[2]! && ys[2]! < ys[3]!).toBe(true)
  })
})

describe("離れたか", () => {
  test("アイコンとミニマップを合わせた枠で測る（間を通っても、ミニマップの上でも離れない）", () => {
    const at = { x: 600, y: 400 }
    const l = pickerSlots(at, 3, map, view)
    const m = l.map!
    expect(leftPicker(l, at, { x: 600, y: m.y + m.h + 3 })).toBe(false)
    expect(leftPicker(l, at, { x: m.x + 10, y: m.y + 10 })).toBe(false)
    expect(leftPicker(l, at, { x: 600, y: m.y - 81 })).toBe(true)
  })
  test("枠から 80px より離れるか、ポインタから見て向こう側へ 40px より通り過ぎると離れた", () => {
    const box = { x: 100, y: 100, w: 200, h: 150 } // ポインタ (200, 300) の上に広げた
    const at = { x: 200, y: 300 }
    expect(leftBox(box, "row", at, { x: 150, y: 150 })).toBe(false)
    expect(leftBox(box, "row", at, { x: 200, y: 320 })).toBe(false)
    expect(leftBox(box, "row", at, { x: 200, y: 340 })).toBe(true)
    expect(leftBox(box, "row", at, { x: 200, y: 59 })).toBe(true)
    expect(leftBox(box, "row", at, { x: 370, y: 150 })).toBe(false)
    expect(leftBox(box, "row", at, { x: 390, y: 150 })).toBe(true)
  })
})

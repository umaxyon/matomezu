// ブックの名前の枠の中、名前の前の印（作業しているワークルームの鳥・ブックの置き場所の印）の並びを確かめる
import { expect, type Locator } from "../fixtures"

// 名前の枠 frame の頭の印 head は、左（枠の左端の強調の線 3px から）と右（名前のボタンの字との間）の余白がそろい、縦は名前の字の中央に在る
export async function expectHeadAligned(frame: Locator, head: Locator) {
  const name = frame.locator("button[aria-haspopup]")
  const [box, mark, text] = await Promise.all([
    frame.boundingBox(),
    head.boundingBox(),
    name.evaluate(e => {
      const range = document.createRange()
      range.selectNodeContents(e)
      const r = range.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }),
  ])
  const [f, m] = [box!, mark!]
  expect(Math.abs(m.x - (f.x + 3) - (text.x - (m.x + m.width)))).toBeLessThanOrEqual(1)
  expect(Math.abs(m.y + m.height / 2 - (text.y + text.height / 2))).toBeLessThanOrEqual(1)
}

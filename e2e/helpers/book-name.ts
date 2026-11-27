// ブックの名前の枠の中、名前の前の印（作業しているワークルームの鳥・ブックの置き場所の印）の並びを確かめる
import { expect, type Locator } from "../fixtures"

// 名前の枠 frame の頭の印 head は、左（枠の左端の強調の線 3px から）と右（名前のボタンの字との間）の余白がそろい、縦は名前の字の中央に在る。
// 3 つの位置は同じコマで測る（ブックスクリーンが滑り込む途中でも、ずれて見えない）
export async function expectHeadAligned(frame: Locator, head: Locator) {
  const mark = await head.elementHandle()
  const { f, m, text } = await frame.evaluate((e, h) => {
    const name = e.querySelector("button[aria-haspopup]")!
    const range = document.createRange()
    range.selectNodeContents(name)
    const box = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height })
    return {
      f: box(e.getBoundingClientRect()),
      m: box(h!.getBoundingClientRect()),
      text: box(range.getBoundingClientRect()),
    }
  }, mark)
  await mark?.dispose()
  expect(Math.abs(m.x - (f.x + 3) - (text.x - (m.x + m.width)))).toBeLessThanOrEqual(1)
  expect(Math.abs(m.y + m.height / 2 - (text.y + text.height / 2))).toBeLessThanOrEqual(1)
}

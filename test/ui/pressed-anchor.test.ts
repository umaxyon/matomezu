// 右クリックで押した物のアンカー: 窓で右クリックを受けて、押した物のアンカーと位置を覚える。
// メニューの置き場は、開いたメニューの位置で右クリックしていたときだけ、そのアンカーを使う
import { expect, test } from "bun:test"
import { pressedAnchor } from "../../web/src/plugins/base/context-menu/pressed-anchor"

const rightClick = (el: Element, x: number, y: number) =>
  el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: x, clientY: y }))

test("押した物のアンカーは、右クリックした位置に開いたメニューだけが読む。ほかの位置のメニューは読まない", () => {
  const thing = document.createElement("div")
  thing.setAttribute("data-anchor", "a1")
  const inner = document.createElement("span")
  thing.append(inner)
  document.body.append(thing)
  rightClick(inner, 10, 20)
  expect(pressedAnchor({ x: 10, y: 20 })).toBe("a1")
  expect(pressedAnchor({ x: 11, y: 20 })).toBeUndefined()
  rightClick(document.body, 30, 40)
  expect(pressedAnchor({ x: 30, y: 40 })).toBeUndefined()
  thing.remove()
})

// 右クリックで押した物のアンカー: 窓で右クリックを受けて、押した物のアンカーと位置を窓の範囲のプラグイン状態に覚える。
// メニューの置き場は、開いたメニューの位置で右クリックしていたときだけ、そのアンカーを使う
import { afterEach, expect, test } from "bun:test"
import { cleanup, render } from "@testing-library/react"
import { pressedAnchorAt, useRememberPressedAnchor } from "../../../web/src/plugins/base/context-menu/pressed-anchor"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { MatomezuProvider } from "../../../web/src/ui/store-context"

afterEach(cleanup)

const rightClick = (el: Element, x: number, y: number) =>
  el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: x, clientY: y }))

function Remember() {
  useRememberPressedAnchor()
  return null
}

test("押した物のアンカーは、右クリックした位置に開いたメニューだけが読む。ほかの位置のメニューは読まない", () => {
  const instance = createMatomezu({
    plugins: [...BUILTIN_UI],
    partial: true,
    controlCenter: "@matomezu/control-center:control-center",
    lang: "ja",
  })
  render(
    <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
      <Remember />
    </MatomezuProvider>,
  )
  const pressed = () => instance.state.getState().pluginValues.window["@matomezu/base:pressed-anchor"] as never
  const thing = document.createElement("div")
  thing.setAttribute("data-anchor", "a1")
  const inner = document.createElement("span")
  thing.append(inner)
  document.body.append(thing)
  rightClick(inner, 10, 20)
  expect(pressedAnchorAt(pressed(), { x: 10, y: 20 })).toBe("a1")
  expect(pressedAnchorAt(pressed(), { x: 11, y: 20 })).toBeUndefined()
  rightClick(document.body, 30, 40)
  expect(pressedAnchorAt(pressed(), { x: 30, y: 40 })).toBeUndefined()
  thing.remove()
})

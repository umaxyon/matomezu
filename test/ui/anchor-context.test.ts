// アンカーだけの右クリックのメニュー（base/context-menu/anchor-context.tsx）: ビューがメニューを開かなかったアンカーの付いた物でだけ開く
import { expect, test } from "bun:test"
import { anchorContextStage } from "../../web/src/plugins/base/context-menu/anchor-context"

test("ステージの中のアンカーの付いた物で、ほかのメニューが開いていなければ開く。テキストFormの中・アンカーの無い所・ステージの外・開いた後は開かない", () => {
  document.body.innerHTML = `
    <div data-stage="s1">
      <div data-anchor="a1"><span id="in"></span><textarea id="text"></textarea></div>
      <div id="bare"></div>
    </div>
    <div data-anchor="a2"><span id="out"></span></div>`
  const at = (id: string, defaultPrevented = false) =>
    anchorContextStage({ target: document.getElementById(id), defaultPrevented })
  expect(at("in")).toBe("s1")
  expect(at("in", true)).toBeNull()
  expect(at("text")).toBeNull()
  expect(at("bare")).toBeNull()
  expect(at("out")).toBeNull()
  document.body.innerHTML = ""
})

// 入力Form（ui/editable.ts）: 右クリックとキーの受け口が、同じ物を入力Formと見る

import { expect, test } from "bun:test"
import { editableOf } from "../../web/src/ui/editable"

const inside = (html: string): Element => {
  const host = document.createElement("div")
  host.innerHTML = html
  const target = host.querySelector("[data-target]")
  if (!target) throw new Error("no target")
  return target
}

test("input・textarea・select と、書ける contenteditable の中は入力Form", () => {
  for (const html of [
    `<input data-target>`,
    `<textarea data-target></textarea>`,
    `<select data-target><option>a</option></select>`,
    `<div contenteditable="true"><span data-target>a</span></div>`,
    `<div contenteditable><span data-target>a</span></div>`,
  ])
    expect(editableOf(inside(html))).not.toBeNull()
})

test("書けないと明示した contenteditable=false と、ふつうの要素は入力Formでない", () => {
  for (const html of [
    `<div contenteditable="false"><span data-target>a</span></div>`,
    `<div><span data-target>a</span></div>`,
  ])
    expect(editableOf(inside(html))).toBeNull()
  expect(editableOf(null)).toBeNull()
})

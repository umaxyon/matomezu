// 物の自分の値（base/mail/own-values.ts）: 物のある所（ページかブック）ごとに比べる。物の id はページの中でだけ重ならないので、同じ id の物が 2 ページにあっても取り違えない
import { expect, test } from "bun:test"
import { putBinder, putPage } from "../../../web/src/core/book"
import { ownChangedIn, ownValuesIn } from "../../../web/src/plugins/base/mail/own-values"
import { drawingPage, SLIDE, testBinder, testBook, testPage } from "../../lineup"

const box = (id: string, caption: string) => ({
  id,
  item: "@matomezu/box:shape-nest-box",
  x: 0,
  y: 0,
  props: { caption, body: "" },
})
const book = testBook("b1", "ブック", [
  drawingPage("p1", { items: [box("x", "一")] }),
  drawingPage("p2", { title: "2", items: [box("x", "二")] }),
  testBinder("f1", "スライド", SLIDE, testPage(SLIDE, "s1", { title: "1 枚目" })),
])

test("同じ id の物が 2 ページにあっても、変わったページの物だけを変わったとする", () => {
  const after = putPage(book, drawingPage("p2", { title: "2", items: [box("x", "変えた")] }))
  expect(ownChangedIn(book, after)).toEqual([{ within: "p2", id: "x" }])
})

test("ページの名前はそのページの所に、バインダの名前とブックの名前はブックの所に入る。ページの中身を変えても、バインダとブックの値は変わらない", () => {
  expect([...ownValuesIn(book).get("b1")!.keys()]).toEqual(["b1", "f1"])
  expect(ownChangedIn(book, putPage(book, drawingPage("p1", { title: "改", items: [box("x", "一")] })))).toEqual([
    { within: "p1", id: "p1" },
  ])
  expect(
    ownChangedIn(
      book,
      putBinder(book, "f1", f => ({ ...f, title: "改" })),
    ),
  ).toEqual([{ within: "b1", id: "f1" }])
  expect(ownChangedIn(book, { ...book, title: "改" })).toEqual([{ within: "b1", id: "b1" }])
})

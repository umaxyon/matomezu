// 郵便のダイアログの開くボタン（mail/open-choices.ts）: 画面の分割の状態で並べるボタンと決めるボタン、押したボタンで開くステージ
import { expect, test } from "bun:test"
import { openChoices, openStageOf } from "../../web/src/plugins/base/mail/open-choices"

const one = { stages: [{ id: "s1" }] } as never
const two = { stages: [{ id: "s1" }, { id: "s2" }] } as never

test("1 画面なら「開く」と「分割で開く」で、決めるのは「開く」。分割で開くのは、分けたあとの右のステージ", () => {
  expect(openChoices(one, "s1")).toEqual({ opens: ["here", "split"], primary: "here" })
  expect(openStageOf(one, "s1", "here")).toBe("s1")
  expect(openStageOf(two, "s1", "split")).toBe("s2")
})

test("2 画面なら「左に開く」と「右に開く」で、決めるのはダイアログを出したステージの側", () => {
  expect(openChoices(two, "s1")).toEqual({ opens: ["left", "right"], primary: "left" })
  expect(openChoices(two, "s2")).toEqual({ opens: ["left", "right"], primary: "right" })
  expect(openStageOf(two, "s2", "left")).toBe("s1")
  expect(openStageOf(two, "s1", "right")).toBe("s2")
})

test("無いステージからは、ボタンを出さず開かない", () => {
  expect(openChoices(one, "x")).toBeNull()
  expect(openStageOf(one, "x", "here")).toBeNull()
})

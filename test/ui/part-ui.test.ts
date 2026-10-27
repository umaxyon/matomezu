import { expect, test } from "bun:test"
import { PARTS } from "../../web/src/core/catalog"
import { pluginKit } from "../../web/src/store/kit"
import { NON_PART_DEFINES, PART_UI } from "../../web/src/ui/part-ui"
import { assembleUi } from "../../web/src/ui/plugin"

const kit = pluginKit("check")

test("どの種類にも、見た目のフィールドと定義を書く関数を書いている（PARTS と同じ種類）", () => {
  expect(Object.keys(PART_UI).sort()).toEqual(Object.keys(PARTS).sort())
})

test("書いた定義の関数は pluginKit にあり、pluginKit の定義の関数はどれもどこかの種類か NON_PART_DEFINES に書いてある", () => {
  const listed: string[] = [...Object.values(PART_UI).flatMap(p => [...p.define]), ...NON_PART_DEFINES]
  const defines = Object.keys(kit).filter(k => k.startsWith("define"))
  for (const name of listed) expect(typeof (kit as unknown as Record<string, unknown>)[name]).toBe("function")
  expect(listed.sort()).toEqual(defines.sort())
})

test("書いた見た目のフィールドは見た目の表にあり、見た目の表のフィールド（ウィジェットのほか）はどれもどこかの種類に書いてある", () => {
  const listed: string[] = Object.values(PART_UI).flatMap(p => [...p.views])
  const fields = Object.keys(assembleUi([])).filter(k => k !== "widgets")
  expect(listed.sort()).toEqual(fields.sort())
})

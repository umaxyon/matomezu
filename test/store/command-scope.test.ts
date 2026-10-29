// コマンドの許可の範囲（store/commands/def.ts の commandScopeOf）
import { expect, test } from "bun:test"
import { type CommandContext, commandScopeOf } from "../../web/src/store/commands/def"

test("コマンドの許可の範囲: 言葉ごとに、呼ばれた場所の様子から所を出す", () => {
  const ctx = () => ({ stage: { opened: { page: "p1" }, selection: ["a"] } }) as unknown as CommandContext
  expect(commandScopeOf("book", ctx())).toEqual({})
  expect(commandScopeOf("opened-page", ctx())).toEqual({ page: "p1" })
  expect(commandScopeOf("selection", ctx())).toEqual({ page: "p1", items: ["a"] })
  expect(commandScopeOf(undefined, ctx())).toBeUndefined()
})

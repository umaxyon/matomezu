// コマンドの許可の範囲（store/commands/def.ts の commandScopeOf と CommandScopeRequired）
import { expect, test } from "bun:test"
import type { MessageKey } from "../../web/src/core/catalog"
import { type CommandContext, commandScopeOf, defineCommand } from "../../web/src/store/commands/def"

test("コマンドの許可の範囲: 言葉ごとに、呼ばれた場所の様子から所を出す", () => {
  const ctx = () => ({ stage: { opened: { page: "p1" }, selection: ["a"] } }) as unknown as CommandContext
  expect(commandScopeOf("book", ctx())).toEqual({})
  expect(commandScopeOf("opened-page", ctx())).toEqual({ page: "p1" })
  expect(commandScopeOf("selection", ctx())).toEqual({ page: "p1", items: ["a"] })
  expect(commandScopeOf(undefined, ctx())).toBeUndefined()
})

test("ブックが対象のアクションを行うコマンドは、許可の範囲を書かなければ型の誤り。ほかは書かなくてよい", () => {
  const base = { title: "@matomezu/base:Delete" as MessageKey, run: () => {}, when: () => true }
  // @ts-expect-error ブックが対象のアクション（item-remove）を行うのに、許可の範囲が無い
  defineCommand({ ...base, id: "a", performs: ["@matomezu/paper:item-remove"] })
  defineCommand({ ...base, id: "b", performs: ["@matomezu/paper:item-remove"], permissionScope: "selection" })
  // 一覧が対象のアクションだけ・アクションを行わないなら要らない
  defineCommand({ ...base, id: "c", performs: ["@matomezu/base:book-create"] })
  defineCommand({ ...base, id: "d" })
  expect(true).toBe(true)
})

// コマンドの許可スコープ（store/commands/def.ts の commandScopeOf と CommandScopeRequired）
import { expect, test } from "bun:test"
import type { MessageKey } from "../../web/src/core/catalog"
import { type CommandContext, commandScopeOf, defineCommand } from "../../web/src/store/commands/def"

test("コマンドの許可スコープ: 言葉ごとに、呼ばれた場所の様子から所を出す", () => {
  const ctx = () => ({ stage: { opened: { kind: "page", page: "p1" }, selection: ["a"] } }) as unknown as CommandContext
  expect(commandScopeOf("book", ctx())).toEqual({})
  expect(commandScopeOf("opened-page", ctx())).toEqual({ page: "p1" })
  expect(commandScopeOf("selection", ctx())).toEqual({ page: "p1", ids: ["a"] })
  expect(commandScopeOf(undefined, ctx())).toBeUndefined()
})

test("コマンドの許可スコープが { page } なら、その名前の引数のページ（まだ引数が無ければ分からない。問う側が開いているページで問う）", () => {
  const ctx = {} as CommandContext
  expect(commandScopeOf({ page: "page" }, ctx, { page: "p2" })).toEqual({ page: "p2" })
  expect(commandScopeOf({ page: "page" }, ctx)).toBeUndefined()
})

test("コマンドの許可スコープが関数なら、呼ばれた引数も受け取る（まだ引数が無ければ undefined）", () => {
  const ctx = {} as CommandContext
  const scope = (_: CommandContext, args: { page: string } | undefined) => ({ page: args?.page ?? "none" })
  expect(commandScopeOf(scope, ctx, { page: "p2" })).toEqual({ page: "p2" })
  expect(commandScopeOf(scope, ctx)).toEqual({ page: "none" })
})

test("ブックが対象のアクションを行うコマンドは、許可スコープを書かなければ型の誤り。ほかは書かなくてよい", () => {
  const base = { title: "@matomezu/base:Delete" as MessageKey, run: () => {}, when: () => true }
  // @ts-expect-error ブックが対象のアクション（item-remove）を行うのに、許可スコープが無い
  defineCommand({ ...base, id: "a", performs: ["@matomezu/paper:item-remove"] })
  defineCommand({ ...base, id: "b", performs: ["@matomezu/paper:item-remove"], permissionScope: "selection" })
  // 一覧が対象のアクションだけ・アクションを行わないなら要らない
  defineCommand({ ...base, id: "c", performs: ["@matomezu/base:book-create"] })
  defineCommand({ ...base, id: "d" })
  expect(true).toBe(true)
})

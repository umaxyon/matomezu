// ex11（ほかのプラグインの列挙に値を足す）で、タスクボードの履歴の題に足した値で履歴に書け、AI に見せる引数にも並ぶことを確かめる
import { expect, test } from "bun:test"
import { enumValuesOf, z } from "matomezu"
import { BUILTIN, createMatomezu } from "matomezu/testing"
import EX11 from ".."

const make = (plugins = [...BUILTIN, EX11]) =>
  createMatomezu({ plugins, controlCenter: "@matomezu/control-center:control-center", lang: "ja" })

test("足した題でチケットの履歴に書ける。足さなければ、その題は断る", () => {
  for (const [plugins, ok] of [
    [[...BUILTIN, EX11], true],
    [[...BUILTIN], false],
  ] as const) {
    const instance = make([...plugins])
    const { actions, state } = instance
    actions.perform("@matomezu/taskboard:project-add", { prefix: "R-" })
    const project = Object.keys(state.getState().records["@matomezu/taskboard:project"] ?? {})[0] ?? ""
    const added = actions.perform("@matomezu/taskboard:ticket-add", { project, name: "t" })
    const ticket = added.ok ? (added.result as { ticket: string }).ticket : ""
    const line = actions.perform("@matomezu/taskboard:ticket-history-add", {
      ticket,
      topic: "ex11:topic-review",
      text: "よい",
    })
    expect(line.ok).toBe(ok)
  }
})

test("AI に見せる ticket-history-add の引数に、足した題が並ぶ", () => {
  const { catalog } = make()
  const args = catalog.core.actions.get("@matomezu/taskboard:ticket-history-add")?.describeArgs?.(catalog.core)
  const description = (
    z.toJSONSchema(args as never, { io: "input" }) as unknown as { properties: { topic: { description: string } } }
  ).properties.topic.description
  expect(description).toContain("ex11:topic-review: The result of reviewing")
  expect(description).toContain("@matomezu/taskboard:topic-plan: A plan")
  expect(JSON.stringify(args?.safeParse({ ticket: "t", topic: "ex11:topic-review", text: "x" }).success)).toBe("true")
  expect(args?.safeParse({ ticket: "t", topic: "nothing", text: "x" }).success).toBe(false)
})

test("自分で宣言した列挙の値を引ける（宣言の value の形の data）", () => {
  const { catalog } = make()
  expect(enumValuesOf(catalog.core, "ex11:level").map(v => [v.id, v.data])).toEqual([["ex11:level-low", { weight: 1 }]])
})

// 追加プラグインを組めずに起動を止めた窓の、起動エラーの画面の直す手: まだ外していない物をホストに外させ、途中で断られたら残りに減らす
import { expect, test } from "bun:test"
import { matomezuError, problem } from "../../web/src/core/errors"
import type { ScreenPluginsRemoved } from "../../web/src/host-client/client"
import { pluginsNotAdded, pluginsNotAddedError } from "../../web/src/host-client/startup-error"

const causes = [
  { name: "ex1", reason: "a" },
  { name: "ex2", reason: "b" },
  { name: "ex3", reason: "c" },
]

// 答えを順に返し、頼まれた ids を残す
function host(...answers: (ScreenPluginsRemoved | Error)[]) {
  const asked: (readonly string[])[] = []
  const remove = async (ids: readonly string[]) => {
    asked.push(ids)
    const next = answers.shift()
    if (!next) throw new Error("no answer")
    if (next instanceof Error) throw next
    return next
  }
  return { asked, remove }
}

test("全部外せたら fixed", async () => {
  const { asked, remove } = host({ state: "removed" })
  const error = pluginsNotAddedError(causes, remove)
  expect(error.kind).toBe("plugins-not-added")
  expect(error.causes).toEqual(causes)
  expect(await error.fix?.()).toEqual({ state: "fixed" })
  expect(asked).toEqual([["ex1", "ex2", "ex3"]])
})

test("途中で断られたら、断られた物から後ろを残りにし、また押すと残りだけを頼む", async () => {
  const { asked, remove } = host({ state: "refused", id: "ex2", reason: "locked" }, { state: "removed" })
  const error = pluginsNotAddedError(causes, remove)
  expect(await error.fix?.()).toEqual({ state: "refused", reason: "locked", causes: causes.slice(1) })
  expect(await error.fix?.()).toEqual({ state: "fixed" })
  expect(asked).toEqual([
    ["ex1", "ex2", "ex3"],
    ["ex2", "ex3"],
  ])
})

test("常駐につながらなければ unreachable で、原因はそのまま（また押すと全部を頼む）", async () => {
  const { asked, remove } = host({ state: "unreachable" }, { state: "removed" })
  const error = pluginsNotAddedError(causes, remove)
  expect(await error.fix?.()).toEqual({ state: "unreachable" })
  await error.fix?.()
  expect(asked).toEqual([
    ["ex1", "ex2", "ex3"],
    ["ex1", "ex2", "ex3"],
  ])
})

test("常駐が断った（E405 などを投げた）ら、その error の文を理由に refused、原因はそのまま", async () => {
  const { remove } = host(new Error("E405 the server could not remove the plugins: 500"))
  const error = pluginsNotAddedError(causes, remove)
  expect(await error.fix?.()).toEqual({
    state: "refused",
    reason: "E405 the server could not remove the plugins: 500",
    causes,
  })
})

test("組めなかった追加プラグインは、読み込めなかった物のあとに、use が E317 で断った物を details の順に並べる", () => {
  const e317 = matomezuError(problem("E317", { count: 2 }), [
    problem("E318", { plugin: "ex2", reason: "E204 plugin ex2: item ex2:a has no view" }),
    problem("E318", { plugin: "ex4", reason: "no view" }),
  ])
  const causes = pluginsNotAdded([{ id: "ex1", error: new Error("broken") }], () => {
    throw e317
  })
  expect(causes).toEqual([
    { name: "ex1", reason: "broken" },
    { name: "ex2", reason: "E204 plugin ex2: item ex2:a has no view" },
    { name: "ex4", reason: "no view" },
  ])
  expect(pluginsNotAdded([], () => {})).toEqual([])
})

test("use が E317 のほかを投げたら、そのまま投げる", () => {
  const other = new Error("other")
  expect(() =>
    pluginsNotAdded([], () => {
      throw other
    }),
  ).toThrow(other)
})

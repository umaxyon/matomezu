// ex14（ほかのプラグインの棚を、自分のアクションで 1 トランザクションに変える）: スタンプを押すと、スタンプの作成と棚の stamps が一緒に変わり、どちらかだけにはならない。
// 持ち主（ex9）のコードは読まないので、持ち主の代わりに、ex14 に許す棚だけを持つ小さなプラグインをここで作る（持ち主との確かめは e2e/plugins）
import { expect, test } from "bun:test"
import { definePlugin, z } from "matomezu"
import { BUILTIN, BUILTIN_CONTROL_CENTER, createMatomezu } from "matomezu/testing"
import EX14 from ".."

// 持ち主の代わり: 棚の種類（ex14 に許す）と、棚を足すアクションだけを持つ（型は付けない）
const SHELF = {
  id: "ex9:shelf",
  title: "@matomezu/base:Language",
  aiDescription: "A shelf.",
  record: z.strictObject({
    id: z.string().min(1),
    name: z.string(),
    closed: z.boolean().optional(),
    stamps: z.number().int().min(0).optional(),
  }),
  writableBy: ["ex14"],
}
const SHELF_ADD = {
  id: "ex9:shelf-add",
  title: "@matomezu/base:Language",
  aiDescription: "Add a shelf.",
  target: SHELF.id,
  args: z.strictObject({ name: z.string().min(1) }),
  run: (_now: unknown, args: { name: string }, ctx: { newId(): string }) => {
    const id = ctx.newId()
    return { next: { id, name: args.name }, result: { shelf: id } }
  },
}
const SHELF_CLOSE = {
  id: "ex9:shelf-close",
  title: "@matomezu/base:Language",
  aiDescription: "Close the shelf.",
  target: SHELF.id,
  args: z.strictObject({}),
  run: (now: unknown) => (now === "none" ? null : { next: { ...(now as object), closed: true }, result: {} }),
}
const OWNER = definePlugin({ id: "ex9", subjects: [SHELF], actions: [SHELF_ADD, SHELF_CLOSE] } as never)

const make = () =>
  createMatomezu({
    plugins: [...BUILTIN, OWNER, EX14] as never,
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "ja",
    partial: true,
  })

test("スタンプを押すと、スタンプが 1 件でき、同じ 1 回で棚の stamps が 1 増える。棚が無ければ断り、何も変わらない", () => {
  const instance = make()
  const perform = instance.actions.perform as unknown as (
    id: string,
    args: unknown,
  ) => { ok: boolean; result?: Record<string, string> }
  const shelf = perform("ex9:shelf-add", { name: "本棚" })
  const id = shelf.result?.shelf ?? ""
  expect(perform("ex14:stamp-add", { shelf: id, mark: "★" }).ok).toBe(true)
  expect(perform("ex14:stamp-add", { shelf: id, mark: "◎" }).ok).toBe(true)
  const records = instance.state.getState().records
  expect(Object.values(records["ex14:stamp"] ?? {}).map(s => (s as { mark: string }).mark)).toEqual(["★", "◎"])
  expect(records["ex9:shelf"]?.[id]).toMatchObject({ stamps: 2 })
  expect(perform("ex14:stamp-add", { shelf: "nothing", mark: "★" }).ok).toBe(false)
  expect(Object.keys(instance.state.getState().records["ex14:stamp"] ?? {})).toHaveLength(2)
})

test("棚が閉じられると、同じ 1 回で、その棚のスタンプに封がされる（ex9 のアクションに、ex14 のフォローステップが応じる）", () => {
  const instance = make()
  const perform = instance.actions.perform as unknown as (
    id: string,
    args: unknown,
    on?: { record: string },
  ) => { ok: boolean; result?: Record<string, string> }
  const shelf = perform("ex9:shelf-add", { name: "本棚" }).result?.shelf ?? ""
  const other = perform("ex9:shelf-add", { name: "箱" }).result?.shelf ?? ""
  perform("ex14:stamp-add", { shelf, mark: "★" })
  perform("ex14:stamp-add", { shelf: other, mark: "◎" })
  expect(perform("ex9:shelf-close", {}, { record: shelf }).ok).toBe(true)
  const stamps = Object.values(instance.state.getState().records["ex14:stamp"] ?? {}) as {
    mark: string
    sealed?: true
  }[]
  expect(stamps.map(s => [s.mark, s.sealed ?? false])).toEqual([
    ["★", true],
    ["◎", false],
  ])
})

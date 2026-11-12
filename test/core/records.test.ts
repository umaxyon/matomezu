// 対象の定義（レコード）: プラグインが足した種類のデータをアクションが 1 件ずつ作る・直す・消す。確かめは宣言の形、番号は常駐が決める
import { expect, test } from "bun:test"
import { z } from "zod"
import { USER } from "../../web/src/core/actor"
import type { ActionDef } from "../../web/src/core/def/action"
import { nextNumber } from "../../web/src/core/def/action"
import type { SubjectDef } from "../../web/src/core/def/subject"
import { type PerformedIn, performIn, permittedIn, type World } from "../../web/src/core/perform"
import { REMOVED, withCounters, withRecord } from "../../web/src/core/records"
import { BUILTIN } from "../../web/src/plugins"
import { assemble, defineBuiltin, type Plugin } from "../../web/src/store/plugin"

const CARD = "@ex/rec:card"
const CENTER = "@ex/rec:center"
const title = "@matomezu/base:Language" as never

const SUBJECT: SubjectDef = {
  id: CARD,
  title,
  aiDescription: "a card",
  record: z.strictObject({ id: z.string().min(1), label: z.string(), no: z.number().optional() }),
  numbered: true,
}
const action = (id: string, over: Record<string, unknown>): ActionDef =>
  ({
    id: `@ex/rec:${id}`,
    title,
    aiDescription: id,
    target: CARD,
    args: z.strictObject({ label: z.string() }),
    ...over,
  }) as never

const ADD = action("card-add", {
  reads: [CARD] as never,
  run: ((_now: unknown, args: { label: string }, ctx: never) => {
    const c = ctx as Parameters<typeof nextNumber>[0]
    const taken = Object.values(c.records?.[CARD] ?? {}).some(r => (r as { label: string }).label === args.label)
    if (taken) return { declined: "the label is taken" }
    return { next: { id: c.newId(), label: args.label, no: nextNumber(c, "@ex/rec:card-add", "all") }, result: {} }
  }) as never,
})
const RENAME = action("card-rename", {
  run: ((now: { id: string }, args: { label: string }) => ({
    next: { ...now, label: args.label },
    result: {},
  })) as never,
})
const REID = action("card-reid", {
  run: ((now: { id: string }) => ({ next: { ...now, id: "other" }, result: {} })) as never,
})
const BAD = action("card-bad", {
  run: ((now: { id: string }) => ({ next: { ...now, extra: 1 }, result: {} })) as never,
})
const REMOVE = action("card-remove", {
  args: z.strictObject({}),
  run: (() => ({ next: REMOVED, result: {} })) as never,
})
const SAME_ID = action("card-same-id", {
  run: (() => ({ next: { id: "c1", label: "x" }, result: {} })) as never,
})
const EX = {
  id: "@ex/rec",
  subjects: [SUBJECT],
  actions: [ADD, RENAME, REID, BAD, REMOVE, SAME_ID],
  controlCenters: [{ id: CENTER, actions: [], subjects: [CARD as never] }],
} as unknown as Plugin
const catalog = assemble([...BUILTIN, defineBuiltin(EX as never)], CENTER).catalog.core

const empty: World = {
  books: {},
  settings: {},
  annotations: {},
  mailbox: [],
  participants: [],
  records: {},
  counters: {},
}
const ids = ["c1", "c2", "c3"]
const ctx = (newIds = [...ids]) => ({
  catalog,
  controlCenter: CENTER,
  lang: "en",
  newId: () => newIds.shift() ?? "z",
  now: "2026-11-12T00:00:00.000Z",
  actor: USER,
})
const run = (world: World, id: string, args: unknown, on?: { record: string }, newIds?: string[]): PerformedIn =>
  performIn(world, `@ex/rec:${id}`, args, on, ctx(newIds))
const apply = (world: World, done: PerformedIn): World =>
  done.ok && done.record
    ? { ...world, records: withRecord(world.records, done.record), counters: withCounters(world.counters, done.record) }
    : world

test("レコードを作ると、新しい 1 件を返す。番号は常駐の決めた次の番号で、区切りごとに進み、返した番号の表を当てると続きから振る", () => {
  const first = run(empty, "card-add", { label: "a" })
  expect(first).toMatchObject({
    ok: true,
    record: { subject: CARD, id: "c1", record: { id: "c1", label: "a", no: 1 } },
  })
  expect(first.ok && first.record?.counters).toEqual({ all: 2 })
  const world = apply(empty, first)
  const second = run(world, "card-add", { label: "b" }, undefined, ["c2"])
  expect(second).toMatchObject({ ok: true, record: { id: "c2", record: { no: 2 } } })
  expect(second.ok && second.record?.counters).toEqual({ all: 3 })
})

test("同じ入力なら同じ結果（番号も）", () => {
  expect(run(empty, "card-add", { label: "a" })).toEqual(run(empty, "card-add", { label: "a" }))
})

test("reads で同じ種類のレコード全部を読め、重なる名前は run が断る", () => {
  const world = apply(empty, run(empty, "card-add", { label: "a" }))
  expect(run(world, "card-add", { label: "a" })).toMatchObject({
    ok: false,
    reason: "refused",
    detail: "the label is taken",
  })
})

test("on の record で指したレコードを直す。無いレコードは no-record で断り、id は変えさせない", () => {
  const world = apply(empty, run(empty, "card-add", { label: "a" }))
  expect(run(world, "card-rename", { label: "b" }, { record: "c1" })).toMatchObject({
    ok: true,
    record: { id: "c1", record: { id: "c1", label: "b", no: 1 } },
  })
  expect(run(world, "card-rename", { label: "b" }, { record: "nope" })).toEqual({ ok: false, reason: "no-record" })
  expect(run(world, "card-reid", { label: "b" }, { record: "c1" })).toEqual({ ok: false, reason: "refused" })
})

test("宣言の形に合わない新しいレコードは断る。今ある id と重なる新しいレコードも断る", () => {
  const world = apply(empty, run(empty, "card-add", { label: "a" }))
  expect(run(world, "card-bad", { label: "b" }, { record: "c1" })).toEqual({ ok: false, reason: "refused" })
  expect(run(world, "card-same-id", { label: "x" })).toEqual({ ok: false, reason: "refused" })
})

test("消すと removed を返し、その種類の最後の 1 件を消せば種類ごと外れる。番号は戻さない", () => {
  const world = apply(empty, run(empty, "card-add", { label: "a" }))
  const gone = run(world, "card-remove", {}, { record: "c1" })
  expect(gone).toMatchObject({ ok: true, record: { subject: CARD, id: "c1", record: REMOVED } })
  const after = apply(world, gone)
  expect(after.records).toEqual({})
  expect(after.counters[CARD]).toEqual({ all: 2 })
  expect(run(empty, "card-remove", {})).toEqual({ ok: false, reason: "refused" })
})

test("コントロールセンターが種類の id で許すと、その種類のアクションが全部使える。許さなければ断る", () => {
  const ok = permittedIn(empty, "@ex/rec:card-add", { label: "a" }, undefined, {
    catalog,
    controlCenter: CENTER,
    actor: USER,
  })
  expect(ok).toEqual({ ok: true })
  const closed = assemble(
    [...BUILTIN, defineBuiltin({ ...EX, controlCenters: [{ id: CENTER, actions: [] }] } as never)],
    CENTER,
  ).catalog.core
  expect(
    permittedIn(empty, "@ex/rec:card-add", { label: "a" }, undefined, {
      catalog: closed,
      controlCenter: CENTER,
      actor: USER,
    }),
  ).toMatchObject({
    ok: false,
    reason: "not-allowed",
  })
})

test("定義の組の確かめ: レコードに id が無い・対象が種類でない・コントロールセンターが知らない種類を許す、は error", () => {
  const broken = (plugin: Plugin) => () => assemble([...BUILTIN, defineBuiltin(plugin as never)], CENTER)
  expect(broken({ ...EX, subjects: [{ ...SUBJECT, record: z.strictObject({ label: z.string() }) } as never] })).toThrow(
    /E016/,
  )
  expect(
    broken({ ...EX, actions: [action("x", { target: "@ex/rec:nothing" as never, run: (() => null) as never })] }),
  ).toThrow(/E016/)
  expect(
    broken({ ...EX, controlCenters: [{ id: CENTER, actions: [], subjects: ["@ex/rec:nothing" as never] }] }),
  ).toThrow(/E016/)
})

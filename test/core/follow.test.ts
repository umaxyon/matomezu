// フォローステップ: レコードの変わりに、ほかのプラグインが同じアクションの変わりとして応じる（core/follow.ts）。
// 応じた変わりは records に載り、followed に名指される。依る順に当て、あとの段は前の段が応じたあとの値を読む。
// きっかけのアクターの認可ステップには止められず、followed を持つ認可ステップ（ロック）だけがかかる
import { expect, test } from "bun:test"
import { z } from "zod"
import { USER } from "../../web/src/core/actor"
import { performBulk } from "../../web/src/core/bulk"
import type { ActionDef } from "../../web/src/core/def/action"
import type { FollowStepDef } from "../../web/src/core/def/follow-step"
import type { SubjectDef } from "../../web/src/core/def/subject"
import { type PerformedIn, performIn, type World } from "../../web/src/core/perform-world"
import { RECORDS_MAX, REMOVED } from "../../web/src/core/records"
import { BUILTIN } from "../../web/src/plugins"
import { assemble, defineBuiltin, type Plugin } from "../../web/src/store/plugin"

const CARD = "@ex/card:card"
const TALLY = "@ex/tally:tally"
const ECHO = "@ex/echo:echo"
const CENTER = "@ex/card:center"
const title = "@matomezu/base:Language" as never

const subject = (id: string, over: Record<string, unknown> = {}): SubjectDef =>
  ({
    id,
    title,
    aiDescription: id,
    record: z.strictObject({ id: z.string().min(1), label: z.string(), locked: z.literal(true).optional() }),
    ...over,
  }) as never
const action = (id: string, over: Record<string, unknown>): ActionDef =>
  ({ id: `@ex/card:${id}`, title, aiDescription: id, target: CARD, args: z.strictObject({}), ...over }) as never

// カードの名前を変える・消す。peek はタリーを読んで、その名前を返す（バルクのあとのアクションが、応じた後の値を見るか）
const RENAME = action("card-rename", {
  args: z.strictObject({ label: z.string() }),
  run: ((now: { id: string }, args: { label: string }) => ({
    next: { ...now, label: args.label },
    result: {},
  })) as never,
})
const REMOVE = action("card-remove", { run: (() => ({ next: REMOVED, result: {} })) as never })
const PEEK = action("card-peek", {
  reads: ((_a: unknown, _b: unknown, on: string) => [{ subject: TALLY, id: `t-${on}` }]) as never,
  run: ((now: unknown, _args: unknown, ctx: { records: Record<string, Record<string, { label: string }>> }) => ({
    next: now,
    result: { tally: Object.values(ctx.records[TALLY] ?? {})[0]?.label },
  })) as never,
})

// タリー: カードごとに 1 件、カードの今の名前を（読む物から）写す。名前が bad なら形に合わない物を返す
const FOLLOW_CARD: FollowStepDef = {
  watches: CARD as never,
  writes: [TALLY as never],
  reads: c => [{ subject: CARD, id: c.id } as never],
  follow: (c, ctx) => {
    const id = `t-${c.id}`
    if (c.after === "removed") return { records: [{ subject: TALLY, id, record: "removed" } as never] }
    const card = ctx.records[CARD]?.[c.id] as { label: string }
    return {
      records: [
        { subject: TALLY, id, record: card.label === "bad" ? { id, label: 1 } : { id, label: card.label } } as never,
      ],
    }
  },
}
// エコー: タリーの変わりに応じて写す（2 段目）。タリーは、前の段が応じたあとの値を読む
const FOLLOW_TALLY: FollowStepDef = {
  watches: TALLY as never,
  writes: [ECHO as never],
  reads: c => [{ subject: TALLY, id: c.id } as never],
  follow: (c, ctx) => {
    const id = `e-${c.id}`
    const tally = ctx.records[TALLY]?.[c.id] as { label: string } | undefined
    return {
      records: [{ subject: ECHO, id, record: tally ? { id, label: `echo ${tally.label}` } : "removed" } as never],
    }
  },
}
// どのレコードもタリーを変えさせない認可ステップ（followed を持たないので、応じた変わりは止めない）
const NO_TALLY = {
  id: "@ex/tally:no-tally",
  title,
  aiDescription: "no tally",
  denies: () => false,
  keeps: (c: { kind: string; subject?: string }) => c.kind !== "record" || c.subject !== TALLY,
}

const plugins = (tally: Partial<Plugin> = {}, echo: Partial<Plugin> = {}) => [
  ...BUILTIN,
  defineBuiltin({
    id: "@ex/card",
    subjects: [subject(CARD)],
    actions: [RENAME, REMOVE, PEEK],
    controlCenters: [{ id: CENTER, actions: [], subjects: "all" }],
  } as never),
  defineBuiltin({
    id: "@ex/tally",
    subjects: [subject(TALLY, { lockable: true })],
    permissions: [NO_TALLY],
    followSteps: [FOLLOW_CARD],
    ...tally,
  } as never),
  defineBuiltin({ id: "@ex/echo", subjects: [subject(ECHO)], followSteps: [FOLLOW_TALLY], ...echo } as never),
]
// 台帳の並びを逆にしても、依る順（タリーが先）に当てる
const catalog = assemble(plugins().reverse(), CENTER).catalog.core

const world = (records: World["records"] = {}): World => ({
  pages: {},
  folders: {},
  settings: {},
  annotations: {},
  counters: {},
  records: { [CARD]: { c1: { id: "c1", label: "a" } }, ...records },
})
const ctx = { catalog, controlCenter: CENTER, lang: "en" as const, actor: USER }
const at = { newId: () => "z", now: "2026-11-22T00:00:00.000Z", today: "2026-11-22" }
const run = (w: World, id: string, args: unknown = {}): PerformedIn =>
  performIn(w, `@ex/card:${id}`, args, { record: "c1" }, { ...ctx, ...at })

test("アクションが変えたレコードに、フォローステップが依る順に応じ、応じた変わりが records に載って followed に名指される", () => {
  expect(run(world(), "card-rename", { label: "b" })).toEqual({
    ok: true,
    result: {},
    records: [
      { subject: CARD, id: "c1", record: { id: "c1", label: "b" } },
      { subject: TALLY, id: "t-c1", record: { id: "t-c1", label: "b" } },
      { subject: ECHO, id: "e-t-c1", record: { id: "e-t-c1", label: "echo b" } },
    ],
    followed: [
      { subject: TALLY, id: "t-c1" },
      { subject: ECHO, id: "e-t-c1" },
    ],
  })
})

test("消したレコードにも応じる。前と同じ値に戻った物は変わりに載らない", () => {
  const had = world({ [TALLY]: { "t-c1": { id: "t-c1", label: "a" } } })
  expect(run(had, "card-remove")).toMatchObject({
    ok: true,
    records: [
      { subject: CARD, id: "c1", record: REMOVED },
      { subject: TALLY, id: "t-c1", record: REMOVED },
    ],
  })
  // 応じる側が今と同じ値を返したら載らない（エコーの段も動かない）
  expect(run(had, "card-rename", { label: "a" })).toEqual({
    ok: true,
    result: {},
    records: [{ subject: CARD, id: "c1", record: { id: "c1", label: "a" } }],
  })
})

test("応じる側が形に合わない物を返したら、きっかけのアクションごと、そのプラグインの名前を添えて断る", () => {
  const done = run(world(), "card-rename", { label: "bad" })
  expect(done).toMatchObject({ ok: false, reason: "refused" })
  expect((done as { detail: string }).detail).toContain("@ex/tally")
})

test("応じた変わりは、きっかけのアクターの認可ステップに止められない。ロック（followed を持つ）には止められる", () => {
  // NO_TALLY はタリーを変える物を止めるが、応じた変わりは止めない
  expect(run(world(), "card-rename", { label: "b" })).toMatchObject({ ok: true })
  const locked = world({ [TALLY]: { "t-c1": { id: "t-c1", label: "a", locked: true } } })
  expect(run(locked, "card-rename", { label: "b" })).toMatchObject({
    ok: false,
    reason: "denied",
    permission: "@matomezu/base:lock",
  })
})

test("アクションバルクのあとのアクションは、前のアクションに応じた後の値を見る。同じカードを 2 回変えても、そのたびに応じる", () => {
  const steps = ["b", "c"].map(label => ({
    action: "@ex/card:card-rename",
    args: { label },
    on: { record: "c1" },
    ...at,
  }))
  const done = performBulk(
    world(),
    [...steps, { action: "@ex/card:card-peek", args: {}, on: { record: "c1" }, ...at }],
    ctx,
  )
  expect(done).toMatchObject({
    ok: true,
    results: [{}, {}, { tally: "c" }],
    records: [
      { subject: CARD, id: "c1", record: { id: "c1", label: "c" } },
      { subject: TALLY, id: "t-c1", record: { id: "t-c1", label: "c" } },
      { subject: ECHO, id: "e-t-c1", record: { id: "e-t-c1", label: "echo c" } },
    ],
    followed: [
      { subject: TALLY, id: "t-c1" },
      { subject: ECHO, id: "e-t-c1" },
    ],
  })
})

test("台帳アセンブルは、自分のでない種類・台帳に無い種類・番号を振る種類を書くフォローステップと、輪を断る。見る種類が無ければ warning", () => {
  const broken =
    (tally: Partial<Plugin>, echo: Partial<Plugin> = {}) =>
    () =>
      assemble(plugins(tally, echo), CENTER)
  expect(broken({ followSteps: [{ ...FOLLOW_CARD, writes: [ECHO as never] }] })).toThrow(/E078|not its own/)
  expect(broken({ followSteps: [{ ...FOLLOW_CARD, writes: ["@ex/tally:none" as never] }] })).toThrow(/E079/)
  expect(broken({ subjects: [subject(TALLY, { numbered: true })], followSteps: [FOLLOW_CARD] })).toThrow(/E079/)
  // エコーがタリーの変わりにエコーを書き、タリーがエコーの変わりにタリーを書く輪
  expect(
    broken({ followSteps: [FOLLOW_CARD, { ...FOLLOW_CARD, watches: ECHO as never }] }, { followSteps: [FOLLOW_TALLY] }),
  ).toThrow(/E080/)
  const unwatched = assemble(plugins({ followSteps: [{ ...FOLLOW_CARD, watches: "@ex/gone:x" as never }] }), CENTER)
  expect(unwatched.catalog.core.warnings.map(w => w.code)).toContain("W034")
  expect(unwatched.catalog.core.followSteps.map(f => f.plugin).filter(p => p.startsWith("@ex/"))).toEqual(["@ex/echo"])
})

test("コントロールセンターは、変える種類に応じるフォローステップが書く種類（その先も）も許していなければ、そのアクションを使わせない", () => {
  const only = (subjects: string[]) =>
    assemble(
      (plugins() as Plugin[]).map(p =>
        (p.id as string) === "@ex/card"
          ? ({ ...p, controlCenters: [{ id: CENTER, actions: [], subjects: subjects as never }] } as never)
          : p,
      ),
      CENTER,
    ).catalog.core
  const renameIn = (catalog: ReturnType<typeof only>) =>
    performIn(world(), "@ex/card:card-rename", { label: "b" }, { record: "c1" }, { ...ctx, ...at, catalog })
  expect(renameIn(only([CARD, TALLY]))).toMatchObject({ ok: false, reason: "not-allowed" })
  expect(renameIn(only([CARD, TALLY, ECHO]))).toMatchObject({ ok: true })
})

test("応じる側の返す物が決まりに外れたら、きっかけのアクションごと断る（数・書かない種類・同じ物を 2 回・作る id の食い違い）", () => {
  const giving = (out: unknown[]) => {
    const catalog = assemble(
      plugins({
        followSteps: [{ ...FOLLOW_CARD, writes: [TALLY as never], follow: () => ({ records: out as never }) }],
      }),
      CENTER,
    ).catalog.core
    const done = performIn(
      world(),
      "@ex/card:card-rename",
      { label: "b" },
      { record: "c1" },
      { ...ctx, ...at, catalog },
    )
    return done.ok ? "ok" : (done as { detail: string }).detail
  }
  const tally = (id: string, label = "x") => ({ subject: TALLY, id, record: { id, label } })
  expect(giving(Array.from({ length: RECORDS_MAX + 1 }, (_, i) => tally(`t${i}`)))).toContain("more than")
  expect(giving([{ subject: ECHO, id: "e", record: { id: "e", label: "x" } }])).toContain("does not write")
  expect(giving([tally("t"), tally("t", "y")])).toContain("twice")
  expect(giving([{ subject: TALLY, id: "t", record: { id: "u", label: "x" } }])).toContain("another id")
  expect(giving([tally("t")])).toBe("ok")
})

test("応じる側が、アクションの前と同じ値を作り直して返したら、変わりに載らない", () => {
  const had = world({ [TALLY]: { "t-c1": { id: "t-c1", label: "b" }, "t-x": { id: "t-x", label: "x" } } })
  const catalog = assemble(
    plugins({
      followSteps: [
        {
          ...FOLLOW_CARD,
          follow: () => ({ records: [{ subject: TALLY, id: "t-x", record: { id: "t-x", label: "x" } }] as never }),
        },
      ],
    }),
    CENTER,
  ).catalog.core
  const done = performIn(had, "@ex/card:card-rename", { label: "b" }, { record: "c1" }, { ...ctx, ...at, catalog })
  expect(done).toEqual({
    ok: true,
    result: {},
    records: [{ subject: CARD, id: "c1", record: { id: "c1", label: "b" } }],
  })
})

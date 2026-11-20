// 対象の定義（レコード）: プラグインが足した種類のデータをアクションが作る・直す・消す（宛先の 1 件と、ほかの同じ種類のレコードを 1 回でまとめて）。確かめは宣言の形、番号は常駐が決める
import { expect, test } from "bun:test"
import { z } from "zod"
import { AI, AI_NOT_JOINED, AI_VISITOR, USER } from "../../web/src/core/actor"
import type { ActionDef } from "../../web/src/core/def/action"
import type { SubjectDef } from "../../web/src/core/def/subject"
import { type PerformedIn, performIn, permittedIn, type World } from "../../web/src/core/perform-world"
import { checkRecords, RECORDS_MAX, REMOVED, withCounters, withRecords } from "../../web/src/core/records"
import { BUILTIN } from "../../web/src/plugins"
import { assemble, defineBuiltin, type Plugin } from "../../web/src/store/plugin"

const CARD = "@ex/rec:card"
const CENTER = "@ex/rec:center"
const NOTE_ID = "@ex/rec:note" as never
const title = "@matomezu/base:Language" as never

const SUBJECT: SubjectDef = {
  id: CARD,
  title,
  aiDescription: "a card",
  record: z.strictObject({ id: z.string().min(1), label: z.string(), no: z.number().optional() }),
  numbered: true,
  keys: {
    label: { type: "text", of: (c: { label: string }) => c.label },
    no: { type: "number", of: (c: { no?: number }) => c.no },
  } as never,
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
  reads: ((args: { label: string }) => [
    { subject: CARD, where: [{ key: "label", eq: args.label }], keysOnly: true },
  ]) as never,
  run: ((_now: unknown, args: { label: string }, ctx: never) => {
    const c = ctx as {
      newId(): string
      keys?: Record<string, Record<string, unknown>>
      number(scope: string): number
    }
    const taken = Object.keys(c.keys?.[CARD] ?? {}).length > 0
    if (taken) return { declined: "the label is taken" }
    return { next: { id: c.newId(), label: args.label, no: c.number("all") }, result: {} }
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
// 宛先を直し、ほかのレコードも引数 others のとおりに変える（宛先のほかに変える物を試す）
const MANY = action("card-many", {
  args: z.strictObject({ label: z.string(), others: z.array(z.unknown()) }),
  run: ((now: { id: string }, args: { label: string; others: unknown[] }) => ({
    next: { ...now, label: args.label },
    others: args.others,
    result: {},
  })) as never,
})
// 宛先を直し、別の種類（メモ。writes に書く）のレコードも引数 others のとおりに変える
const MANY_NOTES = action("card-many-notes", {
  args: z.strictObject({ label: z.string(), others: z.array(z.unknown()) }),
  writes: [NOTE_ID],
  run: ((now: { id: string }, args: { label: string; others: unknown[] }) => ({
    next: { ...now, label: args.label },
    others: args.others,
    result: {},
  })) as never,
})
// reads に自分の種類を書かずに、ほかのレコードを変える
const MANY_UNREAD = action("card-many-unread", {
  args: z.strictObject({ label: z.string(), others: z.array(z.unknown()) }),
  run: ((now: { id: string }, args: { label: string; others: unknown[] }) => ({
    next: { ...now, label: args.label },
    others: args.others,
    result: {},
  })) as never,
})
// カードを指すメモ（refers）と、宛先のメモが指すカードと、指していないカード c2 を ctx.record で読んで返すアクション（reads は書かない）。
// 宛先の id が渡る reads（on）も、そのまま返す
const NOTE = "@ex/rec:note"
const NOTES: SubjectDef = {
  id: NOTE,
  title,
  aiDescription: "a note on a card",
  record: z.strictObject({ id: z.string().min(1), card: z.string() }),
  refers: ((n: { card: string }) => [{ subject: CARD, id: n.card }]) as never,
}
const NOTE_READ = action("note-read", {
  target: NOTE,
  args: z.strictObject({}),
  run: ((now: { card: string }, _args: unknown, ctx: { record(subject: string, id: string): unknown }) => ({
    next: now,
    result: { referred: ctx.record(CARD, now.card), other: ctx.record(CARD, "c2") },
  })) as never,
})
const NOTE_ON = action("note-on", {
  target: NOTE,
  args: z.strictObject({}),
  reads: ((_args: unknown, _actor: unknown, on: string | undefined) =>
    on === undefined ? [] : [{ subject: NOTE, id: on }]) as never,
  run: ((now: unknown, _args: unknown, ctx: { records?: unknown }) => ({
    next: now,
    result: { records: ctx.records },
  })) as never,
})
// 読む物を宣言する: 引数の id の 1 件・ラベルが同じ物・番号の無い物の索引キーだけ。読んだ物をそのまま result に返す
const READS = action("card-reads", {
  args: z.strictObject({ label: z.string(), one: z.string() }),
  reads: ((args: { label: string; one: string }) => [
    { subject: CARD, id: args.one },
    { subject: CARD, where: [{ key: "label", eq: args.label }] },
    { subject: CARD, where: [{ key: "no", is: "absent" }], keysOnly: true },
  ]) as never,
  run: ((now: unknown, _args: unknown, ctx: { records?: unknown; keys?: unknown }) => ({
    next: now,
    result: { records: ctx.records, keys: ctx.keys },
  })) as never,
})
const EX = {
  id: "@ex/rec",
  subjects: [SUBJECT, NOTES],
  actions: [ADD, RENAME, REID, BAD, REMOVE, SAME_ID, MANY, MANY_NOTES, MANY_UNREAD, READS, NOTE_READ, NOTE_ON],
  controlCenters: [{ id: CENTER, actions: [], subjects: [CARD as never, NOTE as never] }],
} as unknown as Plugin
const catalog = assemble([...BUILTIN, defineBuiltin(EX as never)], CENTER).catalog.core

const empty: World = {
  pages: {},
  folders: {},
  settings: {},
  annotations: {},
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
  today: "2026-11-12",
  actor: USER,
})
const run = (world: World, id: string, args: unknown, on?: { record: string }, newIds?: string[]): PerformedIn =>
  performIn(world, `@ex/rec:${id}`, args, on, ctx(newIds))
const apply = (world: World, done: PerformedIn): World =>
  done.ok && done.records
    ? {
        ...world,
        records: withRecords(world.records, done.records),
        counters: withCounters(world.counters, done.counters),
      }
    : world

test("レコードを作ると、新しい 1 件を返す。番号は常駐の決めた次の番号で、区切りごとに進み、返した番号の表を当てると続きから振る", () => {
  const first = run(empty, "card-add", { label: "a" })
  expect(first).toMatchObject({
    ok: true,
    records: [{ subject: CARD, id: "c1", record: { id: "c1", label: "a", no: 1 } }],
  })
  expect(first.ok && first.counters).toEqual({ [CARD]: { all: 2 } })
  const world = apply(empty, first)
  const second = run(world, "card-add", { label: "b" }, undefined, ["c2"])
  expect(second).toMatchObject({ ok: true, records: [{ id: "c2", record: { no: 2 } }] })
  expect(second.ok && second.counters).toEqual({ [CARD]: { all: 3 } })
})

test("同じ入力なら同じ結果（番号も）", () => {
  expect(run(empty, "card-add", { label: "a" })).toEqual(run(empty, "card-add", { label: "a" }))
})

test("reads で同じ名前のレコードの索引キーを読め、重なる名前は run が断る", () => {
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
    records: [{ id: "c1", record: { id: "c1", label: "b", no: 1 } }],
  })
  const missing = run(world, "card-rename", { label: "b" }, { record: "nope" })
  expect(missing).toMatchObject({ ok: false, reason: "no-record" })
  // 断りは、どの種類のどの id が無いかと、on.record の意味を言う
  expect((missing as { detail: string }).detail).toContain("no @ex/rec:card record with the id nope")
  expect((missing as { detail: string }).detail).toContain("on.record is the id of a record of the action's subject")
  // AI に見せない種類（aiBrief なし）は、一覧の引き方も種類の説明も言わない
  expect((missing as { detail: string }).detail).not.toContain("read_records")
  expect((missing as { detail: string }).detail).not.toContain("About that subject")
  expect(run(world, "card-reid", { label: "b" }, { record: "c1" })).toEqual({ ok: false, reason: "refused" })
})

test("宣言の形に合わない新しいレコードは断る。今ある id と重なる新しいレコードも断る", () => {
  const world = apply(empty, run(empty, "card-add", { label: "a" }))
  expect(run(world, "card-bad", { label: "b" }, { record: "c1" })).toEqual({ ok: false, reason: "refused" })
  // 今ある id のレコードを on なしで作ろうとした断りは、on.record にその id を付けて直すと言う
  const same = run(world, "card-same-id", { label: "x" })
  expect(same).toMatchObject({ ok: false, reason: "refused" })
  expect((same as { detail: string }).detail).toContain("is already there: change it with on.record set to c1")
})

test("消すと removed を返し、その種類の最後の 1 件を消せば種類ごと外れる。番号は戻さない", () => {
  const world = apply(empty, run(empty, "card-add", { label: "a" }))
  const gone = run(world, "card-remove", {}, { record: "c1" })
  expect(gone).toMatchObject({ ok: true, records: [{ subject: CARD, id: "c1", record: REMOVED }] })
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

test("残したレコードを確かめ、種類が機能台帳に無い・形が合わないレコードは warning にする（データには手を付けない）", () => {
  const lines = checkRecords(catalog, {
    [CARD]: { c1: { id: "c1", label: "a" }, c2: { id: "c2", label: 1 } },
    "@ex/gone:thing": { t1: { id: "t1" } },
  }).map(w => w.code)
  expect(lines).toEqual(["W025", "W024"])
})

test("参加が確定していない AI（理由は not-joined）とビジター（理由は visitor）は、レコードが対象のアクションを断られる。確定した AI と利用者は行える", () => {
  const ask = (actor: typeof USER) =>
    permittedIn(empty, "@ex/rec:card-add", { label: "a" }, undefined, { catalog, controlCenter: CENTER, actor })
  expect(ask(USER)).toEqual({ ok: true })
  expect(ask(AI)).toEqual({ ok: true })
  expect(ask(AI_NOT_JOINED)).toEqual({ ok: false, reason: "not-allowed", because: "not-joined" })
  expect(ask(AI_VISITOR)).toEqual({ ok: false, reason: "not-allowed", because: "visitor" })
  // 参加を頼む役のアクションは、参加が確定する前にも行える（準備中の AI が参加を頼める）
  const join = permittedIn(
    empty,
    "@matomezu/base:participant-request",
    { ai: "a", model: "m", env: "e", link: "l" },
    undefined,
    {
      catalog,
      controlCenter: CENTER,
      actor: AI_NOT_JOINED,
    },
  )
  expect(join).not.toMatchObject({ because: "not-joined" }) // この試験のコントロールセンターは許していないので、断りは参加の確定とは別
})

test("ロックしたレコードをロックの印を外す形で変えるのを、AI には守らせず、利用者の外す操作だけを通す（印を信じず実際の差分で見る）", () => {
  const LOCKED = defineBuiltin({
    ...EX,
    subjects: [
      {
        ...SUBJECT,
        lockable: true,
        record: z.strictObject({
          id: z.string(),
          label: z.string(),
          no: z.number().optional(),
          locked: z.literal(true).optional(),
        }),
      },
      NOTES,
    ],
    actions: [
      action("card-open", {
        lockSwitch: true,
        args: z.strictObject({}),
        run: ((now: { id: string; label: string }) => ({
          next: { id: now.id, label: now.label },
          result: {},
        })) as never,
      }),
    ],
  } as never)
  const locked = assemble([...BUILTIN, LOCKED], CENTER).catalog.core
  const world: World = { ...empty, records: { [CARD]: { c1: { id: "c1", label: "a", locked: true } } } }
  const open = (actor: typeof USER) =>
    performIn(world, "@ex/rec:card-open", {}, { record: "c1" }, { ...ctx(), catalog: locked, actor })
  expect(open(USER)).toMatchObject({ ok: true })
  expect(open(AI)).toMatchObject({ ok: false, reason: "denied", permission: "@matomezu/base:lock" })
})

// c1・c2 があり、c1 を宛先に直しながら、ほかを変える
const two = (): World => ({
  ...empty,
  records: { [CARD]: { c1: { id: "c1", label: "a" }, c2: { id: "c2", label: "b" } } },
})
const many = (others: unknown[], world = two(), id = "card-many") =>
  run(world, id, { label: "A", others }, { record: "c1" })

test("宛先のほかに、同じ種類のレコードを作る・直す・消すを 1 回で返せる（宛先が先で、ほかは返した順）", () => {
  const done = many([
    { id: "c2", record: REMOVED },
    { id: "c3", record: { id: "c3", label: "c" } },
  ])
  expect(done).toMatchObject({
    ok: true,
    records: [
      { subject: CARD, id: "c1", record: { id: "c1", label: "A" } },
      { subject: CARD, id: "c2", record: REMOVED },
      { subject: CARD, id: "c3", record: { id: "c3", label: "c" } },
    ],
  })
  expect(apply(two(), done).records).toEqual({
    [CARD]: { c1: { id: "c1", label: "A" }, c3: { id: "c3", label: "c" } },
  })
})

test("ほかのレコードの変更が 1 つでも合わなければ、全部を断る（形が合わない・無い物を消す・id が違う・同じ id を 2 度・宛先と同じ id）", () => {
  const refused = { ok: false, reason: "refused" } as const
  expect(
    many([
      { id: "c3", record: { id: "c3", label: "c" } },
      { id: "c2", record: { id: "c2", label: 1 } },
    ]),
  ).toEqual(refused)
  expect(many([{ id: "nope", record: REMOVED }])).toEqual(refused)
  expect(many([{ id: "c3", record: { id: "c4", label: "c" } }])).toEqual(refused)
  expect(
    many([
      { id: "c2", record: REMOVED },
      { id: "c2", record: { id: "c2", label: "x" } },
    ]),
  ).toEqual(refused)
  expect(many([{ id: "c1", record: REMOVED }])).toEqual(refused)
  expect(many([{ id: "c3", record: null }])).toEqual(refused)
})

test("reads を書かないアクションも、同じ種類のほかのレコードを変えられる（前の中身は読み口から引く）", () => {
  expect(many([{ id: "c2", record: REMOVED }], two(), "card-many-unread")).toMatchObject({ ok: true })
})

test("宛先のレコードが指す先は、reads に書かなくても ctx.record で読める（指していないレコードは none）。reads には宛先の id が渡る", () => {
  const world: World = {
    ...empty,
    records: {
      [CARD]: { c1: { id: "c1", label: "a" }, c2: { id: "c2", label: "b" } },
      [NOTE]: { n1: { id: "n1", card: "c1" } },
    },
  }
  expect(run(world, "note-read", {}, { record: "n1" })).toMatchObject({
    ok: true,
    result: { referred: { id: "c1", label: "a" }, other: "none" },
  })
  expect(run(world, "note-on", {}, { record: "n1" })).toMatchObject({
    ok: true,
    result: { records: { [NOTE]: { n1: { id: "n1", card: "c1" } } } },
  })
})

test(`アクション 1 回で変えられるレコードは、宛先と合わせて ${RECORDS_MAX} 件まで`, () => {
  const table = Object.fromEntries(
    Array.from({ length: RECORDS_MAX + 1 }, (_, i) => [`c${i + 1}`, { id: `c${i + 1}`, label: "x" }]),
  )
  const world: World = { ...empty, records: { [CARD]: table } }
  const removing = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i + 2}`, record: REMOVED }))
  expect(many(removing(RECORDS_MAX - 1), world)).toMatchObject({ ok: true })
  expect(many(removing(RECORDS_MAX), world)).toEqual({ ok: false, reason: "refused" })
})

test("認可ステップは、変える全部にかかる（宛先でないロックしたレコードを変えるなら、AI は止められる）", () => {
  const LOCKED = defineBuiltin({
    ...EX,
    subjects: [
      {
        ...SUBJECT,
        lockable: true,
        record: z.strictObject({
          id: z.string(),
          label: z.string(),
          no: z.number().optional(),
          locked: z.literal(true).optional(),
        }),
      },
      NOTES,
    ],
  } as never)
  const locked = assemble([...BUILTIN, LOCKED], CENTER).catalog.core
  const world: World = {
    ...empty,
    records: { [CARD]: { c1: { id: "c1", label: "a" }, c2: { id: "c2", label: "b", locked: true } } },
  }
  const go = (others: unknown[]) =>
    performIn(
      world,
      "@ex/rec:card-many",
      { label: "A", others },
      { record: "c1" },
      { ...ctx(), catalog: locked, actor: AI },
    )
  expect(go([])).toMatchObject({ ok: true })
  expect(go([{ id: "c2", record: REMOVED }])).toMatchObject({
    ok: false,
    reason: "denied",
    permission: "@matomezu/base:lock",
  })
})

test("読む物を関数で宣言したアクションには、答えた物だけが渡る（id の 1 件・条件に合う全部・索引キーだけ）", () => {
  const world: World = {
    ...empty,
    records: {
      [CARD]: {
        c1: { id: "c1", label: "a", no: 1 },
        c2: { id: "c2", label: "b" },
        c3: { id: "c3", label: "a" },
        c4: { id: "c4", label: "c", no: 4 },
      },
    },
  }
  const done = run(world, "card-reads", { label: "a", one: "c4" }, { record: "c1" })
  expect(done).toMatchObject({
    ok: true,
    result: {
      records: {
        [CARD]: {
          c1: { id: "c1", label: "a", no: 1 },
          c3: { id: "c3", label: "a" },
          c4: { id: "c4", label: "c", no: 4 },
        },
      },
      keys: { [CARD]: { c2: { label: "b" }, c3: { label: "a" } } },
    },
  })
  const result = (done as { result: { records: Record<string, object> } }).result
  expect(Object.keys(result.records[CARD] ?? {}).sort()).toEqual(["c1", "c3", "c4"])
})

test("読み口を渡すと、持っているレコードでなく読み口から引く（ホストのエンジンと同じ形）", () => {
  const all: Record<string, unknown> = { c1: { id: "c1", label: "a" }, c2: { id: "c2", label: "b" } }
  const asked: string[] = []
  const world: World = {
    ...empty,
    records: { [CARD]: { c1: all.c1 } },
    source: {
      byId: (_, id) => {
        asked.push(id)
        return all[id]
      },
      candidates: () => all,
    },
  }
  const done = run(world, "card-many-unread", { label: "A", others: [{ id: "c2", record: REMOVED }] }, { record: "c1" })
  expect(done).toMatchObject({ ok: true, records: [{ id: "c1" }, { id: "c2", record: REMOVED }] })
  expect(asked).toContain("c2")
})

// 別の種類（writes に書いた種類）のレコードも、宛先と同じ 1 回で変える
const withNote = (): World => ({ ...two(), records: { ...two().records, [NOTE]: { n1: { id: "n1", card: "c1" } } } })
const manyNotes = (
  others: unknown[],
  world = withNote(),
  id = "card-many-notes",
  actor: typeof USER = USER,
  cat = catalog,
) => performIn(world, `@ex/rec:${id}`, { label: "A", others }, { record: "c1" }, { ...ctx(), actor, catalog: cat })

test("宛先のほかに、writes に書いた別の種類のレコードを作る・直す・消すを 1 回で返せる（宛先が先で、ほかは返した順。種類が違えば同じ id でも通る）", () => {
  const done = manyNotes([
    { subject: NOTE, id: "n1", record: REMOVED },
    { subject: NOTE, id: "n2", record: { id: "n2", card: "c2" } },
    { subject: NOTE, id: "c1", record: { id: "c1", card: "c2" } },
  ])
  expect(done).toMatchObject({
    ok: true,
    records: [
      { subject: CARD, id: "c1", record: { id: "c1", label: "A" } },
      { subject: NOTE, id: "n1", record: REMOVED },
      { subject: NOTE, id: "n2", record: { id: "n2", card: "c2" } },
      { subject: NOTE, id: "c1", record: { id: "c1", card: "c2" } },
    ],
  })
  expect(apply(withNote(), done).records[NOTE]).toEqual({
    n2: { id: "n2", card: "c2" },
    c1: { id: "c1", card: "c2" },
  })
})

test("別の種類のレコードの変更が 1 つでも合わなければ、全部を断る。writes に書いていない種類と、同じ（種類, id）の 2 度は断る", () => {
  const refused = { ok: false, reason: "refused" } as const
  // 別の種類の形に合わない（宛先の変更は通る形でも、全部を断る）
  expect(manyNotes([{ subject: NOTE, id: "n1", record: { id: "n1", card: 1 } }])).toEqual(refused)
  expect(manyNotes([{ subject: NOTE, id: "nope", record: REMOVED }])).toEqual(refused)
  // writes に書いていない種類（宛先の種類のアクション card-many は writes を持たない）
  expect(manyNotes([{ subject: NOTE, id: "n1", record: REMOVED }], withNote(), "card-many")).toEqual(refused)
  // 同じ（種類, id）の 2 度
  expect(
    manyNotes([
      { subject: NOTE, id: "n1", record: REMOVED },
      { subject: NOTE, id: "n1", record: { id: "n1", card: "c2" } },
    ]),
  ).toEqual(refused)
})

test("認可ステップは、writes に書いた別の種類のレコードにも、その種類の定義でかかる（ロックしたメモは AI が変えられない）", () => {
  const locked = assemble(
    [
      ...BUILTIN,
      defineBuiltin({
        ...EX,
        subjects: [
          SUBJECT,
          {
            ...NOTES,
            lockable: true,
            record: z.strictObject({ id: z.string().min(1), card: z.string(), locked: z.literal(true).optional() }),
          },
        ],
      } as never),
    ],
    CENTER,
  ).catalog.core
  const world: World = {
    ...two(),
    records: { ...two().records, [NOTE]: { n1: { id: "n1", card: "c1", locked: true } } },
  }
  const go = (actor: typeof USER) =>
    manyNotes([{ subject: NOTE, id: "n1", record: REMOVED }], world, "card-many-notes", actor, locked)
  expect(go(AI)).toMatchObject({ ok: false, reason: "denied", permission: "@matomezu/base:lock" })
})

test("コントロールセンターが writes の種類を許していなければ、そのアクションは使えない（宛先の種類だけ許していても）", () => {
  const only = assemble(
    [
      ...BUILTIN,
      defineBuiltin({ ...EX, controlCenters: [{ id: CENTER, actions: [], subjects: [CARD as never] }] } as never),
    ],
    CENTER,
  ).catalog.core
  const ask = (id: string, cat = catalog) =>
    permittedIn(
      withNote(),
      `@ex/rec:${id}`,
      { label: "A", others: [] },
      { record: "c1" },
      {
        catalog: cat,
        controlCenter: CENTER,
        actor: USER,
      },
    )
  expect(ask("card-many-notes")).toEqual({ ok: true })
  expect(ask("card-many-notes", only)).toMatchObject({ ok: false, reason: "not-allowed" })
  expect(ask("card-many", only)).toEqual({ ok: true })
  // actions に直に並べたアクションも、writes の種類が許されていなければ使えない
  const listed = assemble(
    [
      ...BUILTIN,
      defineBuiltin({
        ...EX,
        controlCenters: [{ id: CENTER, actions: ["@ex/rec:card-many-notes" as never], subjects: [] }],
      } as never),
    ],
    CENTER,
  ).catalog.core
  expect(ask("card-many-notes", listed)).toMatchObject({ ok: false, reason: "not-allowed" })
})

test("定義の組の確かめ: writes が種類でない・宛先そのもの・番号を振る種類、別のプラグインの種類を宛先か writes にする、ロックの切り替えが writes を持つ、は error", () => {
  const broken = (actions: ActionDef[]) => () =>
    assemble([...BUILTIN, defineBuiltin({ ...EX, actions } as never)], CENTER)
  const w = (id: string, over: Record<string, unknown>) => action(id, { run: (() => null) as never, ...over })
  expect(broken([w("a", { writes: ["@ex/rec:nothing"] })])).toThrow(/E056/)
  expect(broken([w("a", { writes: [CARD] })])).toThrow(/E057/)
  expect(broken([w("a", { target: NOTE_ID, writes: [CARD] })])).toThrow(/E059/)
  expect(broken([w("a", { writes: ["@matomezu/base:mail"] })])).toThrow(/E058/)
  expect(broken([w("a", { target: "@matomezu/base:mail", writes: [] })])).toThrow(/E058/)
  expect(broken([w("a", { writes: [NOTE_ID], lockSwitch: true })])).toThrow(/E060/)
  expect(broken([w("a", { writes: [NOTE_ID] })])).not.toThrow()
})

test("別のプラグインの種類を宛先か writes にできるのは、持ち主が対象の定義の writableBy にそのプラグインを書いたときだけ", () => {
  const OTHER = "@ex/other"
  const mine = (over: Record<string, unknown>) =>
    ({
      id: `${OTHER}:mine`,
      title,
      aiDescription: "x",
      record: z.strictObject({ id: z.string().min(1) }),
      ...over,
    }) as never
  const writer = (id: string, over: Record<string, unknown>) =>
    ({
      id: `${OTHER}:${id}`,
      title,
      aiDescription: id,
      target: `${OTHER}:mine`,
      args: z.strictObject({}),
      run: (() => null) as never,
      ...over,
    }) as never
  const build = (cardOver: Record<string, unknown>, actions: unknown[]) => () =>
    assemble(
      [
        ...BUILTIN,
        defineBuiltin({ ...EX, subjects: [SUBJECT, { ...NOTES, ...cardOver } as never] } as never),
        defineBuiltin({ id: OTHER, subjects: [mine({})], actions, controlCenters: [] } as never),
      ],
      CENTER,
    )
  const writes = writer("w", { writes: [NOTE_ID] })
  const target = writer("t", { target: NOTE_ID })
  expect(build({}, [writes])).toThrow(/E058/) // 持ち主が許していない
  expect(build({}, [target])).toThrow(/E058/)
  expect(build({ writableBy: ["@ex/elsewhere"] }, [writes])).toThrow(/E058/) // 別のプラグインだけ許している
  expect(build({ writableBy: [OTHER] }, [writes, target])).not.toThrow()
})

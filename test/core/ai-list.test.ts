// AI の一覧（read_records）の、種類の全部を読む道: 載せる物・載せない物（aiListed）・unlisted の 3 つの扱い・where（索引キーだけ）・数・指す先の読み・形に合わないレコード
import { expect, test } from "bun:test"
import { z } from "zod"
import { listAIRecords } from "../../web/src/core/ai-list"
import type { SubjectDef } from "../../web/src/core/def/subject"
import { CORE_CATALOG } from "../support"

// 箱（done の箱に入った物は載せない）と、箱を指す物
const box = (id: string, done: boolean) => ({ id, done })
const things = [
  { id: "t1", box: "b1", n: 1 },
  { id: "t2", box: "b2", n: 2 },
  { id: "t3", box: "b1", n: 3 },
  { id: "t4", box: "gone", n: 4 },
]
const THING = {
  id: "@ex/ai:thing",
  title: "x",
  aiDescription: "a thing",
  record: z.strictObject({ id: z.string(), box: z.string(), n: z.number() }),
  refers: (t: { box: string }) => [{ subject: "@ex/ai:box", id: t.box }],
  keys: {
    box: { type: "text", of: (t: { box: string }) => t.box },
    n: { type: "number", of: (t: { n: number }) => t.n },
  },
  aiBrief: (t: { id: string; n: number }) => `${t.id} #${t.n}`,
  aiOrder: (t: { n: number }) => -t.n,
  aiListed: {
    when: (t: { box: string }, ctx: { record(s: string, id: string): unknown }) => {
      const b = ctx.record("@ex/ai:box", t.box) as { done?: boolean } | "none"
      return b === "none" || b.done !== true
    },
    unlisted: "things in a done box",
  },
} as unknown as SubjectDef
const boxes: Record<string, unknown> = { b1: box("b1", false), b2: box("b2", true) }
const byId = (subject: string, id: string) => (subject === "@ex/ai:box" ? boxes[id] : undefined)
const list = (mode: "hide" | "include" | "only", where: Record<string, string> = {}, records: unknown[] = things) =>
  listAIRecords(CORE_CATALOG, THING, records, where, mode, byId)

test("既定（hide）は載せる物だけを、並びの鍵の順に返し、載せなかった数を添える。指す先が無い物は載せる", () => {
  const out = list("hide")
  expect(out.rows.map(r => r.id)).toEqual(["t4", "t3", "t1"])
  expect(out.rows[0]).toEqual({ id: "t4", brief: "t4 #4" })
  expect(out.unlisted).toBe(1)
})

test("include は全部、only は載せない物だけ（数は添えない）", () => {
  expect(list("include").rows.map(r => r.id)).toEqual(["t4", "t3", "t2", "t1"])
  const only = list("only")
  expect(only.rows.map(r => r.id)).toEqual(["t2"])
  expect(only.unlisted).toBe(0)
})

test("where に合う物の中で分け、載せなかった数も where に合う物だけを数える", () => {
  const out = list("hide", { box: "b2" })
  expect(out.rows).toEqual([])
  expect(out.unlisted).toBe(1)
  expect(list("hide", { box: "b1" }).unlisted).toBe(0)
  expect(list("only", { n: "2" }).rows.map(r => r.id)).toEqual(["t2"])
})

test("where は索引キーの値と比べる（索引キーでない項目では絞れない。形に合わないレコードは、条件があれば合わない）", () => {
  // id は索引キーでないので、同じ値でも合わない（呼ぶ側が名前を断る。ここまで届いても何にも合わない）
  expect(list("include", { id: "t1" }).rows).toEqual([])
  expect(list("include", { n: "3" }).rows.map(r => r.id)).toEqual(["t3"])
  const broken = [...things, { id: "bad", box: 1 }]
  expect(list("include", {}, broken).rows.map(r => r.id)).toContain("bad")
  expect(list("include", { box: "b1" }, broken).rows.map(r => r.id)).toEqual(["t3", "t1"])
})

test("指す先は、そのレコードが指す先（refers）だけ読める。ほかの物は none", () => {
  const seen: unknown[] = []
  const peek = {
    ...THING,
    aiListed: {
      unlisted: "x",
      when: (_t: unknown, ctx: { record(s: string, id: string): unknown }) => {
        seen.push(ctx.record("@ex/ai:box", "b1"), ctx.record("@ex/ai:box", "b2"), ctx.record("@ex/ai:other", "x"))
        return true
      },
    },
  } as unknown as SubjectDef
  listAIRecords(CORE_CATALOG, peek, [things[0]], {}, "hide", byId)
  expect(seen).toEqual([box("b1", false), "none", "none"]) // t1 が指すのは b1 だけ
})

test("題（aiBrief）も、指す先（refers）だけ読める。ほかの物は none", () => {
  const seen: unknown[] = []
  const peek = {
    ...THING,
    aiBrief: (t: { id: string }, ctx: { record(s: string, id: string): unknown }) => {
      seen.push(ctx.record("@ex/ai:box", "b1"), ctx.record("@ex/ai:box", "b2"))
      return t.id
    },
  } as unknown as SubjectDef
  listAIRecords(CORE_CATALOG, peek, [things[0]], {}, "hide", byId)
  expect(seen).toEqual([box("b1", false), "none"])
})

test("形に合わないレコードは、載せる物として id だけの行で残す（only には出ない）。aiListed の無い種類は全部載せる", () => {
  const bad = [...things, { id: "bad", box: 1 }]
  expect(list("hide", {}, bad).rows.map(r => r.id)).toEqual(["t4", "t3", "t1", "bad"])
  expect(list("hide", {}, bad).rows[3]).toEqual({ id: "bad", brief: "" })
  expect(list("only", {}, bad).rows.map(r => r.id)).toEqual(["t2"])
  const plain = { ...THING, aiListed: undefined } as unknown as SubjectDef
  const all = listAIRecords(CORE_CATALOG, plain, things, {}, "hide", byId)
  expect(all.rows).toHaveLength(4)
  expect(all.unlisted).toBe(0)
})

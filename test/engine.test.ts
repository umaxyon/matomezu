// 常駐が埋め込む engine.js が、今のソースから作ったものと同じか（ソースを変えたら bun run build:engine）と、エンジンの入口のうちレコードと郵便の物
import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..")

test("internal/engine/engine.js は web/src/engine/engine.ts から作り直したものと同じ", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "engine-")), "engine.js")
  // package.json の build:engine と同じ組み方で、出す先だけ変える
  const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts as Record<string, string>
  const args = scripts["build:engine"]!.split(" ")
  args[args.indexOf("--outfile") + 1] = out
  // bun test が入れる NODE_ENV=test を組み方に混ぜない（production で組む）
  const env = { ...process.env, NODE_ENV: "production" }
  const build = Bun.spawn(args, { cwd: ROOT, env, stdout: "ignore", stderr: "inherit" })
  expect(await build.exited).toBe(0)
  expect(readFileSync(join(ROOT, "internal/engine/engine.js"), "utf8")).toBe(readFileSync(out, "utf8"))
})

// ホストのエンジンの入口（常駐が呼ぶグローバル関数）のうち、レコードと郵便の物
import "../web/src/engine/engine"

const MAIL = "@matomezu/base:mail"
const engine = globalThis as unknown as {
  matomezuPerform(input: string): string
  matomezuRecordNeeds(action: string, args: string): string
  matomezuAiRows(kind: string, records: string): string
}
const letter = (n: number, seen = false) => ({
  id: `m${n}`,
  mail: "@matomezu/base:letter",
  from: "a",
  sentAt: "2026-11-12T00:00:00.000Z",
  props: { title: `t${n}`, body: "" },
  order: n,
  ...(seen ? { seenAt: "2026-11-12T00:00:00.000Z" } : {}),
})
// 200 通の郵便（m1 だけ見た）。AI が 1 通送ると、上限を守るために m1 が消える
const full = () => Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`m${i + 1}`, letter(i + 1, i === 0)]))
const send = (watchedRecords?: Record<string, string[]>) =>
  JSON.parse(
    engine.matomezuPerform(
      JSON.stringify({
        actions: [
          {
            action: "@matomezu/base:mail-send",
            args: { from: "a", title: "new" },
            ids: ["newmail001"],
            now: "2026-11-12T00:00:00.000Z",
          },
        ],
        settings: {},
        records: { [MAIL]: full() },
        counters: { [MAIL]: { mail: 201 } },
        actor: { kind: "ai", workroom: "room" },
        ...(watchedRecords ? { watchedRecords } : {}),
      }),
    ),
  )

test("エンジンは 1 回のアクションで変えたレコードの全部を records で返し、進めた番号を counters で返す", () => {
  const out = send()
  expect(out).toMatchObject({
    ok: true,
    records: [
      { subject: MAIL, id: "newmail001", record: { id: "newmail001", order: 201 } },
      { subject: MAIL, id: "m1", record: "removed" },
    ],
    counters: { [MAIL]: { mail: 202 } },
  })
})

test("エンジンの編集ロックは、変えるレコードの全部にかかる（宛先でない、消す郵便を利用者が直していても being-edited）", () => {
  expect(send({ [MAIL]: ["m1"] })).toEqual({ ok: false, reason: "being-edited", at: 0 })
  expect(send({ [MAIL]: ["m2"] })).toMatchObject({ ok: true })
})

test("RecordNeeds は対象の種類（ほかに読むレコードは、行う間に読み口から引く）と、readsBooks が引数から答えた読むブックの id を返す（引数が合わなければ空）", () => {
  const needs = (action: string, args: unknown) =>
    JSON.parse(engine.matomezuRecordNeeds(action, args === undefined ? "" : JSON.stringify(args)))
  const proposal = { from: "a", title: "t", book: "b1", changes: [{ action: "x", args: {} }] }
  expect(needs("@matomezu/base:proposal-send", proposal)).toEqual({ subject: MAIL, books: ["b1"] })
  expect(needs("@matomezu/base:proposal-send", { book: "b1" })).toEqual({ subject: MAIL, books: [] })
  expect(needs("@matomezu/base:mail-seen", {})).toEqual({ subject: MAIL, books: [] })
  expect(needs("@matomezu/base:book-create", undefined)).toEqual({ subject: null, books: [] })
})

test("AiRows は受けた順のまま、郵便の一覧の行（種類が添えるフィールドと題。中身は見せない）を返す", () => {
  const records = [letter(3), { ...letter(1), seenAt: "t" }]
  const rows = JSON.parse(engine.matomezuAiRows(MAIL, JSON.stringify(records)))
  expect(rows.map((m: { id: string }) => m.id)).toEqual(["m3", "m1"])
  expect(rows[0]).toMatchObject({ mail: "@matomezu/base:letter", from: expect.any(String), brief: expect.any(String) })
  expect(rows[1].seenAt).toBe("t")
  expect(rows.some((m: object) => "props" in m)).toBe(false)
  expect(engine.matomezuAiRows("@ex/none:x", "[]")).toBe("null")
})

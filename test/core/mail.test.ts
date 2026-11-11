// 郵便箱のアクションの結果の確かめ（core/mail.ts の mailboxSettles）: 新しく入った・変わった郵便は、形に合い、種類が機能台帳にあって props がその形に合うものだけ。
// 前からあった郵便は、効かなくなっていても（種類を外したなど）そのまま通す
import { expect, test } from "bun:test"
import { checkMailbox, type Mail, type MailQuery, mailboxSettles, mailForAi } from "../../web/src/core/mail"
import { CORE_CATALOG } from "../support"

const letter = (id: string, props: unknown, mail = "@matomezu/base:letter"): Mail => ({
  id,
  mail,
  project: "default",
  from: "a",
  sentAt: "2026-11-06T00:00:00.000Z",
  props,
})

test("新しい郵便は、種類が機能台帳にあり、props がその形に合えば通る。種類が無い・props が合わない・形が合わない物は断る", () => {
  const good = letter("m1", { title: "題", body: "" })
  expect(mailboxSettles(CORE_CATALOG, [], [good])).toBe(true)
  expect(mailboxSettles(CORE_CATALOG, [], [letter("m2", { title: "題", body: "" }, "@ex/x:nothing")])).toBe(false)
  expect(mailboxSettles(CORE_CATALOG, [], [letter("m3", { title: "", body: "" })])).toBe(false)
  expect(mailboxSettles(CORE_CATALOG, [], [{ ...good, id: "" }])).toBe(false)
})

test("前からあった郵便は、効かなくなっていても確かめ直さない", () => {
  const old = letter("m1", { title: "題", body: "" }, "@ex/x:gone")
  expect(mailboxSettles(CORE_CATALOG, [old], [old, letter("m2", { title: "次", body: "" })])).toBe(true)
})

test("郵便箱の効かない郵便は warning にする（種類が無いのは W022、形が合わないのは W023）。データには手を付けない", () => {
  const list = [letter("m1", { title: "題", body: "" }), letter("m2", {}, "@ex/x:gone"), letter("m3", { title: "" })]
  expect(checkMailbox(CORE_CATALOG, list).map(w => [w.code, w.params.id])).toEqual([
    ["W022", "m2"],
    ["W023", "m3"],
  ])
})

test("id が重なる郵便箱は断る", () => {
  const a = letter("m1", { title: "題", body: "" })
  expect(mailboxSettles(CORE_CATALOG, [a], [a, letter("m1", { title: "次", body: "" })])).toBe(false)
})

// AI が郵便を読む取り方（mailForAi）。箱は古い順に m1〜m5（default の 4 通と work の 1 通）。m1 は開いて行き先を見た、m2 は開いた（行き先は無い）、
// m3 は未開封で行き先を見ていない、m4 は未開封で行き先が無い、m5（work）は未開封
const box = (): Mail[] => [
  { ...letter("m1", { title: "一番目", body: "本文 1" }), to: { book: "b" }, seenAt: "t", visitedAt: "t" },
  { ...letter("m2", { title: "二番目", body: "本文 2" }), seenAt: "t" },
  { ...letter("m3", { title: "三番目", body: "本文 3" }), to: { book: "b", page: "p" } },
  { ...letter("m4", { title: "四番目\n改行", body: "本文 4" }) },
  { ...letter("m5", { title: "work の手紙", body: "" }), project: "work" },
]
const boxed = (i: number) => box()[i] as Mail
const ids = (r: ReturnType<typeof mailForAi>) => (r.ok ? r.answer.mailbox.map(m => m.id) : `ng: ${r.reason}`)
const ask = (query: MailQuery, projects = ["default"], mailbox: Mail[] = box()) =>
  mailForAi(CORE_CATALOG, mailbox, projects, query)

test("AI が読む郵便の一覧は、projects で絞り、新しい順で、中身を外して種類の aiBrief の題を付け、total と older を添える", () => {
  const all = ask({})
  expect(ids(all)).toEqual(["m4", "m3", "m2", "m1"])
  expect(all.ok && all.answer).toMatchObject({ total: 4, older: 0 })
  const row = all.ok && "total" in all.answer ? all.answer.mailbox[0] : undefined
  expect(row).toEqual({
    id: "m4",
    mail: "@matomezu/base:letter",
    project: "default",
    from: "a",
    sentAt: "2026-11-06T00:00:00.000Z",
    title: "四番目 改行",
  })
  expect(ids(ask({}, ["default", "work"]))).toEqual(["m5", "m4", "m3", "m2", "m1"])
  expect(ids(ask({}, ["work"]))).toEqual(["m5"])
})

test("limit は新しい方から N 通で、older は返した中で一番古い郵便より古い、絞りに合う数。before はその郵便より古い分（その郵便は含まない）", () => {
  const two = ask({ limit: "2" })
  expect(ids(two)).toEqual(["m4", "m3"])
  expect(two.ok && two.answer).toMatchObject({ total: 4, older: 2 })
  expect(ids(ask({ limit: "2", before: "m3" }))).toEqual(["m2", "m1"])
  const last = ask({ limit: "5", before: "m2" })
  expect(ids(last)).toEqual(["m1"])
  expect(last.ok && last.answer).toMatchObject({ total: 4, older: 0 })
  expect(ids(ask({ before: "m1" }))).toEqual([])
})

test("unseen は利用者がまだ開いていない郵便だけ、unvisited は行き先があって、まだ見ていない郵便だけ。before の位置は絞る前の箱で数える", () => {
  expect(ids(ask({ unseen: "1" }))).toEqual(["m4", "m3"])
  expect(ids(ask({ unvisited: "1" }))).toEqual(["m3"])
  const some = ask({ unseen: "1", limit: "1" })
  expect(some.ok && some.answer).toMatchObject({ total: 2, older: 1 })
  // m2 は開いた郵便で絞りから落ちるが、before の目印にはできる
  expect(ids(ask({ unseen: "1", before: "m2" }))).toEqual([])
  expect(ids(ask({ unseen: "1", before: "m4" }))).toEqual(["m3"])
})

test("ids は指した郵便の全文（props 付き。箱の新しい順で、重なりは 1 つ）と、無い・projects の外の id（unknown。あるときだけ）", () => {
  const got = ask({ ids: ["m1", "m3", "m1", "nothing", "m5"] })
  expect(got.ok && got.answer).toEqual({ mailbox: [boxed(2), boxed(0)], unknown: ["m5", "nothing"] })
  const full = ask({ ids: ["m2"] })
  expect(full.ok && full.answer).toEqual({ mailbox: [boxed(1)] })
})

test("合わない取り方は、理由を付けて断る（limit が 1〜100 の整数でない・箱に無い before・ids と他の取り方・ids の数）", () => {
  for (const limit of ["0", "-1", "101", "1.5", "x", ""])
    expect(ids(ask({ limit }))).toMatch(/^ng: limit is an integer/)
  expect(ids(ask({ before: "nothing" }))).toMatch(/^ng: no such letter/)
  expect(ids(ask({ before: "m5" }))).toMatch(/^ng: no such letter/) // projects の外
  expect(ids(ask({ ids: ["m1"], limit: "1" }))).toMatch(/^ng: ids cannot be given together/)
  expect(ids(ask({ ids: [] }))).toMatch(/^ng: ids takes/)
  expect(ids(ask({ ids: Array.from({ length: 21 }, (_, i) => `m${i}`) }))).toMatch(/^ng: ids takes/)
  expect(ids(ask({ limit: "100" }))).toEqual(["m4", "m3", "m2", "m1"])
})

test("一覧の題は、種類の aiBrief を 80 字で切る。種類が台帳に無い・形が合わない郵便は、題を付けずに行を残す（total にも数える）", () => {
  const fits80 = letter("m6", { title: "あ".repeat(80), body: "" })
  const over = letter("m7", { title: "い".repeat(81), body: "" }) // 手紙の題の上限（80 字）を超える形
  const join = (id: string, sessionName: string) =>
    letter(
      id,
      { participant: "p", ai: "claude", model: "opus", env: "wsl", sessionName, projects: ["default"] },
      "@matomezu/base:join-request",
    )
  const mixed = [
    letter("m1", {}, "@ex/x:gone"),
    letter("m2", { title: "" }),
    fits80,
    over,
    join("m8", "s"),
    join("m9", "x".repeat(100)),
  ]
  const got = ask({}, ["default"], mixed)
  expect(got.ok && got.answer).toMatchObject({ total: 6 })
  const rows = got.ok && "total" in got.answer ? got.answer.mailbox : []
  expect(rows.map(r => [r.id, r.title])).toEqual([
    ["m9", `join request: claude opus ${"x".repeat(54)}… (126 chars)`],
    ["m8", "join request: claude opus s"],
    ["m7", undefined],
    ["m6", "あ".repeat(80)],
    ["m2", undefined],
    ["m1", undefined],
  ])
})

// 参加者（base の参加者の表）: 参加者の表は利用者に 1 つで、ブックのデータとは別に持つ。要求は AI も行え、受け入れる・断るは利用者だけ。
// 参加要求の郵便（mail-join-request）は、別の対象（郵便箱）に届く
import { expect, test } from "bun:test"
import { translate } from "../../web/src/core/i18n/i18n"
import type { Mail } from "../../web/src/core/mail"
import type { Participant } from "../../web/src/core/participant"
import { performIn } from "../../web/src/core/perform"
import { type MailT, shownOf } from "../../web/src/plugins/base/mail/shown"
import { CORE_CATALOG, newStore } from "../support"

const REQUEST = "@matomezu/base:participant-request"
const ACCEPT = "@matomezu/base:participant-accept"
const DECLINE = "@matomezu/base:participant-decline"
const JOIN_MAIL = "@matomezu/base:mail-join-request"

const WHO = { ai: "claude", model: "opus", env: "wsl", sessionName: "D92", link: "L1" }

function ready() {
  const store = newStore()
  const people = (): readonly Participant[] => store.state.getState().participants
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown }
  const request = (args: object = WHO) => perform(REQUEST, args) as { ok: boolean; result: { participant: string } }
  return { store, people, perform, request }
}

test("要求すると、受け入れていない参加者が表の末尾に足され、id を返す", () => {
  const { people, request } = ready()
  const done = request({ ...WHO, workroom: "引き継ぎ" })
  expect(done.ok).toBe(true)
  expect(people()).toEqual([
    {
      id: done.result.participant,
      state: "requested",
      ai: "claude",
      model: "opus",
      env: "wsl",
      sessionName: "D92",
      link: "L1",
      workroom: "引き継ぎ",
      requestedAt: expect.any(String),
    },
  ])
  // セッション名は省いてよい（空になる）
  expect(request({ ai: "codex", model: "m", env: "mac", link: "L2" }).ok).toBe(true)
  expect(people()[1]).toMatchObject({ sessionName: "" })
  // 合言葉が空なら要求しない
  expect(request({ ...WHO, link: " " }).ok).toBe(false)
})

test("同じ link の要求は何も変えず、同じ id を返す（受け入れたあとも）", () => {
  const { people, request, perform } = ready()
  const first = request()
  const before = people()
  expect(request({ ...WHO, model: "other" })).toEqual({ ok: true, result: { participant: first.result.participant } })
  expect(people()).toBe(before)
  perform(ACCEPT, { participant: first.result.participant, workroom: "A", bird: "inko" })
  expect(request().result.participant).toBe(first.result.participant)
  expect(people()).toHaveLength(1)
})

test("受け入れると、ワークルーム・鳥・配色・受け入れた時点を一度に書く。2 回目の受け入れは断る", () => {
  const { people, request, perform } = ready()
  const { participant } = request().result
  expect(perform(ACCEPT, { participant, workroom: "", bird: "inko" }).ok).toBe(false)
  expect(perform(ACCEPT, { participant, workroom: "A", bird: "dodo" }).ok).toBe(false)
  expect(perform(ACCEPT, { participant, workroom: "A", bird: "inko", palette: "none" }).ok).toBe(false)
  expect(people()[0]).toMatchObject({ state: "requested" })
  expect(perform(ACCEPT, { participant, workroom: "A", bird: "inko", palette: "forest" }).ok).toBe(true)
  expect(people()[0]).toMatchObject({
    state: "joined",
    workroom: "A",
    bird: "inko",
    palette: "forest",
    joinedAt: expect.any(String),
  })
  const joined = people()
  expect(perform(ACCEPT, { participant, workroom: "B", bird: "suzume" }).ok).toBe(false)
  expect(people()).toBe(joined)
  expect(perform(ACCEPT, { participant: "none", workroom: "A", bird: "inko" }).ok).toBe(false)
})

test("断ると表から消える（断りは残さない）。受け入れた参加者と、無い参加者は断れない", () => {
  const { people, request, perform } = ready()
  const a = request().result.participant
  const b = request({ ...WHO, link: "L2" }).result.participant
  perform(ACCEPT, { participant: b, workroom: "B", bird: "buncho" })
  expect(perform(DECLINE, { participant: a }).ok).toBe(true)
  expect(people().map(p => p.id)).toEqual([b])
  expect(perform(DECLINE, { participant: a }).ok).toBe(false)
  expect(perform(DECLINE, { participant: b }).ok).toBe(false)
  // 断ったあとの同じ link の要求は、新しい参加者になる
  expect(request().result.participant).not.toBe(a)
})

test("AI は要求できるが、受け入れる・断るはできない（利用者だけ）", () => {
  const { store, request } = ready()
  const { participant } = request().result
  const s = store.state.getState()
  const world = {
    books: s.books,
    settings: s.settings,
    annotations: s.annotations,
    mailbox: s.mailbox,
    participants: s.participants,
  }
  const ctx = {
    catalog: CORE_CATALOG,
    home: "@matomezu/master:master" as never,
    lang: "en" as const,
    newId: () => "n",
    now: "t",
    by: "ai" as const,
  }
  const ai = (action: string, args: unknown) => performIn(world, action, args, undefined, ctx)
  expect(ai(REQUEST, { ...WHO, link: "L9" }).ok).toBe(true)
  const refused = { ok: false, reason: "not-allowed" } as const
  expect(ai(ACCEPT, { participant, workroom: "A", bird: "inko" })).toEqual(refused)
  expect(ai(DECLINE, { participant })).toEqual(refused)
})

test("同じ入力（時刻と id のもと）なら同じ結果", () => {
  const run = () => {
    const world = { books: {}, settings: {}, annotations: {}, mailbox: [], participants: [] }
    const ctx = {
      catalog: CORE_CATALOG,
      home: "@matomezu/master:master" as never,
      lang: "en" as const,
      newId: () => "0123456789abcdef",
      now: "2026-11-08T00:00:00.000Z",
    }
    return performIn(world, REQUEST, WHO, undefined, ctx)
  }
  expect(run()).toEqual(run())
  expect(run()).toMatchObject({ ok: true, participants: [{ requestedAt: "2026-11-08T00:00:00.000Z" }] })
})

test("表は 100 人まで。超えたら受け入れていない要求の古い物から消え、受け入れた参加者だけなら要求を断る", () => {
  const { people, request, perform } = ready()
  const first = request({ ...WHO, link: "k0" }).result.participant
  for (let i = 1; i < 100; i++) request({ ...WHO, link: `k${i}` })
  expect(people()).toHaveLength(100)
  request({ ...WHO, link: "k100" })
  expect(people()).toHaveLength(100)
  expect(people().some(p => p.id === first)).toBe(false)
  for (const p of people()) perform(ACCEPT, { participant: p.id, workroom: p.link, bird: "inko" })
  expect(request({ ...WHO, link: "k101" }).ok).toBe(false)
  expect(people()).toHaveLength(100)
})

test("参加要求の郵便は郵便箱に 1 通だけ届き、本文に ai・model・env・セッション名を持つ。同じ参加者なら増えない", () => {
  const { store, perform } = ready()
  const args = { from: "claude", participant: "p1", ai: "claude", model: "opus", env: "wsl", sessionName: "D92" }
  const done = perform(JOIN_MAIL, args) as { ok: boolean; result: { mail: string } }
  expect(done.ok).toBe(true)
  const mails = (): readonly Mail[] => store.state.getState().mailbox
  expect(mails()).toEqual([
    {
      id: done.result.mail,
      mail: "@matomezu/base:join-request",
      from: "claude",
      sentAt: expect.any(String),
      props: { participant: "p1", ai: "claude", model: "opus", env: "wsl", sessionName: "D92" },
    },
  ])
  const ja: MailT = (key, params) => translate(CORE_CATALOG.messages, "ja", key, params)
  expect(shownOf(CORE_CATALOG, mails()[0]!, ja)).toEqual({
    title: "AI エージェントから参加要求が届きました",
    body: "AI: claude\nモデル: opus\n環境: wsl\nセッション: D92",
  })
  expect(perform(JOIN_MAIL, args)).toEqual({ ok: true, result: { mail: done.result.mail } })
  expect(mails()).toHaveLength(1)
  expect(perform(JOIN_MAIL, { ...args, participant: "p2" }).ok).toBe(true)
  expect(mails()).toHaveLength(2)
})

// プロジェクト: ブック・郵便・参加者は表にあるプロジェクトに属し、表に無いプロジェクトを指したアクションは断られる
import { expect, test } from "bun:test"
import { DEFAULT_PROJECT, isProject, PROJECTS } from "../../web/src/core/project"
import { newStore } from "../support"

const CREATE = "@matomezu/base:book-create"
const SEND = "@matomezu/base:mail-send"
const REQUEST = "@matomezu/base:participant-request"
const JOIN_MAIL = "@matomezu/base:mail-join-request"

const WHO = { ai: "claude", model: "opus", env: "wsl", link: "L1" }

test("プロジェクトの表は、標準の 1 つだけを持つ", () => {
  expect(PROJECTS).toEqual([{ id: DEFAULT_PROJECT, name: "Default" }])
  expect(isProject(DEFAULT_PROJECT)).toBe(true)
  expect(isProject("other")).toBe(false)
})

test("ブックは作るときに指したプロジェクトに属し、表に無いプロジェクトでは作れない", () => {
  const store = newStore()
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown }
  const made = perform(CREATE, { title: "図", project: DEFAULT_PROJECT, type: "@matomezu/drawing:drawing" }) as {
    ok: true
    result: { book: string }
  }
  expect(made.ok).toBe(true)
  expect(store.state.getState().books[made.result.book]).toMatchObject({ project: DEFAULT_PROJECT })
  const was = Object.keys(store.state.getState().books).length
  expect(perform(CREATE, { title: "図", project: "other", type: "@matomezu/drawing:drawing" })).toMatchObject({
    ok: false,
    reason: "refused",
    detail: expect.stringContaining("no such project: other"),
  })
  expect(perform(CREATE, { title: "図", type: "@matomezu/drawing:drawing" })).toMatchObject({
    ok: false,
    reason: "bad-args",
  })
  expect(Object.keys(store.state.getState().books)).toHaveLength(was)
})

test("郵便はプロジェクトに属し、表に無いプロジェクトには送れない", () => {
  const store = newStore()
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean }
  expect(perform(SEND, { project: DEFAULT_PROJECT, from: "a", title: "x" }).ok).toBe(true)
  expect(store.state.getState().mailbox[0]).toMatchObject({ project: DEFAULT_PROJECT })
  expect(perform(SEND, { project: "other", from: "a", title: "y" })).toMatchObject({ ok: false, reason: "refused" })
  expect(perform(SEND, { from: "a", title: "z" })).toMatchObject({ ok: false, reason: "bad-args" })
  expect(store.state.getState().mailbox).toHaveLength(1)
})

test("参加者は参加するプロジェクトを持ち、同じ合言葉で重ねて要求しても重ならない。表に無いプロジェクトは断る", () => {
  const store = newStore()
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean; result?: unknown }
  const first = perform(REQUEST, { ...WHO, projects: [DEFAULT_PROJECT, DEFAULT_PROJECT] }) as {
    ok: true
    result: { participant: string }
  }
  expect(first.ok).toBe(true)
  expect(store.state.getState().participants[0]).toMatchObject({ projects: [DEFAULT_PROJECT] })
  expect(perform(REQUEST, { ...WHO, projects: [DEFAULT_PROJECT] })).toEqual({ ok: true, result: first.result })
  expect(store.state.getState().participants).toHaveLength(1)
  expect(store.state.getState().participants[0]).toMatchObject({ projects: [DEFAULT_PROJECT] })
  expect(perform(REQUEST, { ...WHO, link: "L2", projects: ["other"] })).toMatchObject({ ok: false, reason: "refused" })
  expect(perform(REQUEST, { ...WHO, link: "L3", projects: [] })).toMatchObject({ ok: false, reason: "bad-args" })
  expect(store.state.getState().participants).toHaveLength(1)
})

test("参加要求の郵便は、参加を求めたプロジェクトを持ち、最初のプロジェクトに属する", () => {
  const store = newStore()
  const perform = store.actions.perform as (id: string, args: unknown) => { ok: boolean }
  const args = { from: "claude", participant: "p1", ai: "claude", model: "opus", env: "wsl" }
  expect(perform(JOIN_MAIL, { ...args, projects: ["other"] })).toMatchObject({ ok: false, reason: "refused" })
  expect(perform(JOIN_MAIL, { ...args, projects: [DEFAULT_PROJECT] }).ok).toBe(true)
  expect(store.state.getState().mailbox[0]).toMatchObject({
    project: DEFAULT_PROJECT,
    props: { projects: [DEFAULT_PROJECT] },
  })
})

// ホストのエンジンでのフォローステップ: 応じた変わりが利用者の直している物（編集ロック）に当たれば、利用者のアクションでも断る。
// 通れば、応じて変えたレコードを AI への知らせ（notice）に書く
import { expect, test } from "bun:test"
import { USER } from "../../web/src/core/actor"
import { performIn, type World } from "../../web/src/core/perform-world"
import { withCounters, withRecords } from "../../web/src/core/records"
import "../../web/src/engine/engine"
import { BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { CURRENT_WORK } from "../../web/src/plugins/taskboard/current-work"
import type { Project } from "../../web/src/plugins/taskboard/project"
import { CORE_CATALOG } from "../support"

const engine = globalThis as unknown as { matomezuPerform(input: string): string }
const T = (id: string) => `@matomezu/taskboard:${id}`

// ワークルーム 1 つと、それを担当に持つ作業中でないレーンのチケット 1 枚
function board() {
  let w: World = { pages: {}, folders: {}, settings: {}, annotations: {}, records: {}, counters: {} }
  let n = 0
  const user = (action: string, args: unknown) => {
    const done = performIn(w, action, args, undefined, {
      catalog: CORE_CATALOG,
      controlCenter: BUILTIN_CONTROL_CENTER as never,
      lang: "en",
      newId: () => `n${++n}`,
      now: "2026-11-22T00:00:00.000Z",
      today: "2026-11-22",
      actor: USER,
    })
    if (!done.ok) throw new Error(JSON.stringify(done))
    w = { ...w, records: withRecords(w.records, done.records ?? []), counters: withCounters(w.counters, done.counters) }
    return done.result as Record<string, string>
  }
  const room = user("@matomezu/base:workroom-add", { name: "a", bird: "inko" }).workroom as string
  user(T("project-add"), {})
  const project = Object.values(w.records[T("project")] ?? {})[0] as Project
  const lane = (working: boolean) =>
    project.lanes.flatMap(l =>
      l.kind === "lane" && (l.working === true) === working && l.id !== project.doneLane ? [l.id] : [],
    )[0] as string
  const ticket = user(T("ticket-add"), { project: project.id, name: "t", lane: lane(false), assignees: [room] })
    .ticket as string
  return { room, ticket, doing: lane(true), records: w.records }
}

// 利用者がチケットを作業中のレーンへ移す（ワークルームのカレントワークを、フォローステップがこのチケットにする）
// watched なら、利用者がそのワークルームのカレントワークを直している
const move = (watched = false) => {
  const { room, ticket, doing, records } = board()
  const out = JSON.parse(
    engine.matomezuPerform(
      JSON.stringify({
        actions: [
          {
            action: T("ticket-update"),
            args: { lane: doing },
            on: { record: ticket },
            now: "2026-11-22T01:00:00.000Z",
          },
        ],
        settings: {},
        records,
        ...(watched ? { watchedRecords: { [CURRENT_WORK.id]: [room] } } : {}),
      }),
    ),
  )
  return { out, room, ticket }
}

test("応じて変えたレコードは、利用者のアクションでも、直している物なら being-edited で断る", () => {
  expect(move(true).out).toEqual({ ok: false, reason: "being-edited", at: 0 })
})

test("通れば、応じて変えたレコードが records に載り、notice に書かれる", () => {
  const { out, room, ticket } = move()
  expect(out).toMatchObject({
    ok: true,
    records: [
      { subject: T("ticket"), id: ticket },
      { subject: CURRENT_WORK.id, id: room, record: { id: room, ticket } },
    ],
  })
  expect(out.notice).toContain(`${CURRENT_WORK.id} ${room}`)
})

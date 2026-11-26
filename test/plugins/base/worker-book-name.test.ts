// ワーカーブックの名前（base のフォローステップ）: ブックの名前は作業のレコードの短く呼ぶ名前（チケットの番号）か、ワークルームの名前の写しなので、
// それが変わったら同じ書き込みで直す。プロジェクトのチケットプレフィクスが変わると、そのプロジェクトのチケットのブックの名前が変わる。
// ページの名前には、そのブックの今の番号を写させない（認可ステップ worker-page-title）
import { expect, test } from "bun:test"
import { USER } from "../../../web/src/core/actor"
import { backyardIdOf, HOME_ID } from "../../../web/src/core/folders"
import { type PerformedIn, performIn, type World } from "../../../web/src/core/perform-world"
import { withCounters, withRecords } from "../../../web/src/core/records"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { TICKETS_HISTORY } from "../../../web/src/plugins/base/library/backyards"
import { drawingPage, testBook } from "../../lineup"
import { CORE_CATALOG, libraryWith } from "../../support"

const A = (id: string) => `@matomezu/taskboard:${id}`
const WORKROOM = "@matomezu/base:workroom"
const YARD = backyardIdOf(TICKETS_HISTORY.id)
type Done = PerformedIn & { result?: Record<string, string> }

// プロジェクト 2 つ（T- と U-）に 1 枚ずつのチケット、ワークルーム 1 つと、その 3 つのワーカーブック（名前は今の写し）
function setup() {
  let w: World = { pages: {}, folders: {}, settings: {}, annotations: {}, records: {}, counters: {} }
  let n = 0
  const act = (action: string, args: unknown, on?: { record: string }) => {
    const done = performIn(w, action, args, on, {
      catalog: CORE_CATALOG,
      controlCenter: BUILTIN_CONTROL_CENTER as never,
      lang: "ja",
      newId: () => `n${++n}`,
      now: "2026-11-26T00:00:00.000Z",
      today: "2026-11-26",
      actor: USER,
    }) as Done
    if (done.ok)
      w = {
        ...w,
        ...(done.records ? { records: withRecords(w.records, done.records) } : {}),
        counters: withCounters(w.counters, done.counters),
      }
    return done
  }
  const project = (prefix: string) => act(A("project-add"), { prefix }).result?.project as string
  const [p1, p2] = [project("T-"), project("U-")]
  const t1 = act(A("ticket-add"), { project: p1, name: "a" }).result?.ticket as string
  const t2 = act(A("ticket-add"), { project: p2, name: "b" }).result?.ticket as string
  const room = act("@matomezu/base:workroom-add", { name: "sub9", bird: "inko" }).result?.workroom as string
  const library = libraryWith([
    testBook("b1", "T-0001", [drawingPage("b1-p"), drawingPage("b1-old", { title: "T-0001 前からの物" })]),
    testBook("b2", "U-0001", [drawingPage("b2-p")]),
    testBook("own", "sub9", [drawingPage("own-p")]),
  ])
  w = {
    ...w,
    pages: library.pages,
    folders: {
      ...library.folders,
      [HOME_ID]: { folderRole: "home", id: HOME_ID, lineup: [] },
      [YARD]: {
        folderRole: "backyard",
        id: YARD,
        backyard: TICKETS_HISTORY.id,
        lineup: [
          { kind: "book", id: "b1", workKey: { subject: A("ticket"), id: t1 } },
          { kind: "book", id: "b2", workKey: { subject: A("ticket"), id: t2 } },
          { kind: "book", id: "own", workKey: { subject: WORKROOM, id: room } },
        ],
      },
    } as never,
  }
  const titleIn = (done: Done, book: string) =>
    (done as { changes?: { folders: Record<string, { title?: string }> } }).changes?.folders[book]?.title
  return { act, p1, room, titleIn }
}

test("プロジェクトのチケットプレフィクスを変えると、そのプロジェクトのチケットのワーカーブックの名前が今の番号になり、ほかのプロジェクトのブックは変わらない", () => {
  const { act, p1, titleIn } = setup()
  const done = act(A("project-update"), { prefix: "X-" }, { record: p1 })
  expect(done.ok).toBe(true)
  expect(titleIn(done, "b1")).toBe("X-0001")
  expect(titleIn(done, "b2")).toBeUndefined()
  // 名前を変えたブックは、常駐が編集ロックを確かめる行に入る
  expect(done.ok && done.followedRows).toEqual(["b1"])
})

test("プレフィクスの変わらないプロジェクトの変わりでは、ワーカーブックの名前を変えない", () => {
  const { act, p1, titleIn } = setup()
  const done = act(A("project-update"), { name: "べつの名前" }, { record: p1 })
  expect(done.ok).toBe(true)
  expect(titleIn(done, "b1")).toBeUndefined()
})

test("ワークルームの名前を変えると、そのワークルーム自身のワーカーブックの名前が変わる。鳥だけ変えても変わらない", () => {
  const { act, room, titleIn } = setup()
  const renamed = act("@matomezu/base:workroom-update", { name: "sub10" }, { record: room })
  expect(titleIn(renamed, "own")).toBe("sub10")
  const bird = act("@matomezu/base:workroom-update", { bird: "suzume" }, { record: room })
  expect(bird.ok).toBe(true)
  expect(titleIn(bird, "own")).toBeUndefined()
})

const DENIED = { ok: false, reason: "denied", permission: "@matomezu/base:worker-page-title" }

test("チケットのワーカーブックに、今の番号で始まる名前のページは足せず、名前もそれに変えられない。ほかの番号や記号を頭に付けた名前は通る", () => {
  const { act } = setup()
  const add = (title: string) =>
    act("@matomezu/base:page-add", { type: "@matomezu/drawing:drawing", title }, { book: "b1" } as never)
  expect(add("T-0001 メモ")).toMatchObject(DENIED)
  expect(add("T-0001")).toMatchObject(DENIED)
  expect(add("T-00012 メモ").ok).toBe(true)
  expect(add("U-0001 のメモ").ok).toBe(true)
  expect(add("[T-0001] メモ").ok).toBe(true)
  const rename = (title: string) => act("@matomezu/base:page-update", { title }, { page: "b1-p" } as never)
  expect(rename("T-0001 図")).toMatchObject(DENIED)
  expect(rename("図").ok).toBe(true)
})

test("前から番号で始まる名前のページが在っても、そのブックのほかのページは変えられる", () => {
  const { act } = setup()
  const done = act("@matomezu/base:page-update", { title: "別の図" }, { page: "b1-p" } as never)
  expect(done.ok).toBe(true)
})

test("ワークルーム自身のワーカーブックは、ワークルームの名前で始まるページの名前も通る", () => {
  const { act } = setup()
  const done = act("@matomezu/base:page-update", { title: "sub9 のメモ" }, { page: "own-p" } as never)
  expect(done.ok).toBe(true)
})

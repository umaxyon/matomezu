// ワーカーブックの認可ステップ（base の worker-book）: tickets-history のブックを書けるのは、そのブックがワーカーブックのワークルームの AI と利用者だけ。
// ステップは宣言した種類のレコードだけを読む口と、ブックのバックヤードの印と workKey を受ける（core が行う文脈の世界から渡す）
import { describe, expect, test } from "bun:test"
import { type Actor, AI, AI_NOT_JOINED, AI_VISITOR, USER } from "../../../web/src/core/actor"
import type { CoreCatalog } from "../../../web/src/core/core-catalog"
import type { ActionContext, ActionDef } from "../../../web/src/core/def/action"
import type { BackyardEntry } from "../../../web/src/core/def/permission"
import { backyardIdOf, HOME_ID } from "../../../web/src/core/folders"
import { performIn, type World } from "../../../web/src/core/perform-world"
import { readerOf, sourceOf } from "../../../web/src/core/record-source"
import type { Records } from "../../../web/src/core/records"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { TICKETS_HISTORY } from "../../../web/src/plugins/base/library/backyards"
import { WORKER_BOOK } from "../../../web/src/plugins/base/participant/worker-book"
import { drawingPage, testBook } from "../../lineup"
import { CORE_CATALOG, libraryWith, sequence } from "../../support"

const WORKROOM = "@matomezu/base:workroom"
const roomKey = (id: string) => ({ subject: WORKROOM, id })

describe("認可ステップを直に問う", () => {
  // 種類 s が、レコード w（id はワークルーム）の ticket を作業中のチケットとして答える機能台帳
  const catalog = {
    ...CORE_CATALOG,
    subjects: new Map([
      [
        "s",
        {
          workroomWorkReads: ["w"],
          workroomWork: (room: string, read: { record(s: string, id: string): unknown }) => {
            const w = read.record("w", room) as { ticket?: string }
            return w?.ticket
              ? { kind: "working", title: w.ticket, key: { subject: "t", id: w.ticket }, label: w.ticket }
              : { kind: "idle" }
          },
        },
      ],
    ]),
  } as unknown as CoreCatalog
  const records = { w: { room: { ticket: "t1" } } } as unknown as Records
  const input = { catalog, read: readerOf(catalog, sourceOf(records), WORKER_BOOK.reads?.(catalog) ?? []) }
  const action = CORE_CATALOG.actions.get("@matomezu/base:page-add") as ActionDef
  const book = testBook("b1", "T1", [drawingPage("p1")])
  const entry = (subject: string, id: string, backyard: string = TICKETS_HISTORY.id): BackyardEntry => ({
    backyard,
    workKey: { subject, id },
  })
  const denies = (actor: Actor, backyardEntry?: BackyardEntry) =>
    WORKER_BOOK.denies(
      { kind: "folder", action, folder: book, actor, ...(backyardEntry ? { backyardEntry } : {}) },
      input,
    )
  const keeps = (actor: Actor, before?: BackyardEntry, after?: BackyardEntry) =>
    WORKER_BOOK.keeps?.(
      {
        kind: "folder",
        action,
        before: book,
        after: book,
        changes: { gone: false, place: "same", added: false, fields: [], lineup: false, pages: [] },
        backyardEntry: { ...(before ? { before } : {}), ...(after ? { after } : {}) },
        actor,
      },
      input,
    )

  test("作業中のワークルームの AI は、そのチケットのブックを書ける。ほかの AI・ビジター・確定していない AI は止まり、利用者は通る", () => {
    const own = entry("t", "t1")
    const other = { kind: "ai", workroom: { id: "other" } } as const
    expect([denies({ kind: "ai", workroom: { id: "room" } }, own), denies(other, own)]).toEqual([false, true])
    expect([denies(AI_VISITOR, own), denies(AI_NOT_JOINED, own), denies(USER, own)]).toEqual([true, true, false])
    expect([keeps(AI, own, own), keeps(other, own, own), keeps(other, undefined, own), keeps(USER, own, own)]).toEqual([
      true,
      false,
      false,
      true,
    ])
  })

  test("空きのワークルームの AI は、ワークルーム自身のブックを書ける。バックヤードに無いブックと、ほかのバックヤードのブックは止めない", () => {
    const idle = { kind: "ai", workroom: { id: "idle" } } as const
    expect([denies(idle, entry(WORKROOM, "idle")), denies(idle, entry("t", "t1"))]).toEqual([false, true])
    expect([denies(idle), denies(idle, entry("t", "t1", "@x/y:yard"))]).toEqual([false, false])
  })

  test("読むのは、ワークルームの作業を答える種類が宣言した種類とワークルームだけ", () => {
    expect(WORKER_BOOK.reads?.(catalog)).toEqual(["w", WORKROOM])
  })
})

describe("行うときに core が渡す物", () => {
  // tickets-history に、ワークルーム r1 自身のワーカーブック b1 を置いた世界（どのワークルームも空き）
  function world(): World {
    const library = libraryWith([testBook("b1", "r1", [drawingPage("p1")])])
    const yard = backyardIdOf(TICKETS_HISTORY.id)
    return {
      pages: library.pages,
      folders: {
        ...library.folders,
        [HOME_ID]: { folderRole: "home", id: HOME_ID, lineup: [] },
        [yard]: {
          folderRole: "backyard",
          id: yard,
          backyard: TICKETS_HISTORY.id,
          lineup: [{ kind: "book", id: "b1", workKey: roomKey("r1") }],
        },
      },
      settings: {},
      annotations: {},
      records: {},
      counters: {},
    }
  }
  const ctx = (actor: Actor): Omit<ActionContext, "naming"> => ({
    catalog: CORE_CATALOG,
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "en",
    newId: sequence("w"),
    now: "2026-11-22T00:00:00.000Z",
    today: "2026-11-22",
    actor,
  })
  const add = (actor: Actor) =>
    performIn(world(), "@matomezu/base:page-add", { type: "@matomezu/drawing:drawing" }, { book: "b1" }, ctx(actor))

  test("ワーカーブックのワークルームの AI と利用者はページを足せ、ほかの AI は worker-book で断られる", () => {
    expect(add({ kind: "ai", workroom: { id: "r1" } }).ok).toBe(true)
    expect(add(USER).ok).toBe(true)
    expect(add({ kind: "ai", workroom: { id: "r2" } })).toMatchObject({
      ok: false,
      reason: "denied",
      permission: "@matomezu/base:worker-book",
    })
  })
})

describe("ワーカーブックにページを足す（worker-page-add）", () => {
  // tickets-history に、ワークルーム r1 自身のワーカーブック b1 を置いた世界（どのワークルームも空き）
  function world(): World {
    const library = libraryWith([testBook("b1", "r1", [drawingPage("p1")])])
    const yard = backyardIdOf(TICKETS_HISTORY.id)
    return {
      pages: library.pages,
      folders: {
        ...library.folders,
        [HOME_ID]: { folderRole: "home", id: HOME_ID, lineup: [] },
        [yard]: {
          folderRole: "backyard",
          id: yard,
          backyard: TICKETS_HISTORY.id,
          lineup: [{ kind: "book", id: "b1", workKey: roomKey("r1") }],
        },
      },
      settings: {},
      annotations: {},
      records: {},
      counters: {},
    }
  }
  const ctx = (actor: Actor): Omit<ActionContext, "naming"> => ({
    catalog: CORE_CATALOG,
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "en",
    newId: sequence("w"),
    now: "2026-11-22T00:00:00.000Z",
    today: "2026-11-22",
    actor,
  })
  const ai = (room: string): Actor => ({ kind: "ai", workroom: { id: room } })
  const add = (actor: Actor, args: object = {}) =>
    performIn(
      world(),
      "@matomezu/base:worker-page-add",
      { type: "@matomezu/drawing:drawing", title: "メモ", ...args },
      undefined,
      ctx(actor),
    )
  const yardOf = (done: ReturnType<typeof add>) =>
    done.ok
      ? (done.changes?.folders?.[backyardIdOf(TICKETS_HISTORY.id)] as unknown as { lineup: unknown[] })
      : undefined

  test("ブックが在れば、その最後に足す", () => {
    const done = add(ai("r1"))
    expect(done).toMatchObject({ ok: true, result: { book: "b1" } })
    const page = (done as { result: { page: string } }).result.page
    const b1 = (done as unknown as { changes: { folders: Record<string, { lineup: { id: string }[] }> } }).changes
      .folders.b1
    expect(b1?.lineup.map(r => r.id)).toEqual(["p1", page])
  })

  test("ブックが無ければ、ワークルームの名前で作り、workKey を付けてバックヤードの最後に置く", () => {
    const done = add(ai("r2"))
    expect(done.ok).toBe(true)
    const book = (done as { result: { book: string } }).result.book
    expect(yardOf(done)?.lineup).toEqual([
      { kind: "book", id: "b1", workKey: roomKey("r1") },
      { kind: "book", id: book, workKey: roomKey("r2") },
    ])
  })

  test("利用者はワークルームを渡して足す。AI がほかのワークルームを渡すと worker-book で断られ、ワークルームの無い者は足せない", () => {
    expect(add(USER, { workroom: "r1" })).toMatchObject({ ok: true, result: { book: "b1" } })
    expect(add(ai("r2"), { workroom: "r1" })).toMatchObject({
      ok: false,
      reason: "denied",
      permission: "@matomezu/base:worker-book",
    })
    expect(add(USER).ok).toBe(false)
  })

  test("バックヤードのブックとその中のページは、利用者もロックできない", () => {
    const lock = (id: string, on: { book: string } | { page: string }) =>
      performIn(world(), `@matomezu/base:${id}`, {}, on, ctx(USER))
    expect(lock("book-lock", { book: "b1" })).toMatchObject({ ok: false, permission: "@matomezu/base:lock" })
    expect(lock("page-lock", { page: "p1" })).toMatchObject({ ok: false, permission: "@matomezu/base:lock" })
  })
})

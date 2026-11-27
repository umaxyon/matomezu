// ワーカーブックの認可ステップ（base の worker-book）: tickets-history のブックを書けるのは、そのブックがワーカーブックのワークルームの AI と利用者だけ。
// ステップは宣言した種類のレコードだけを読む口と、ブックのバックヤードの印と workKey を受ける（core が行う文脈の世界から渡す）
import { describe, expect, test } from "bun:test"
import { type Actor, AI, AI_NOT_JOINED, AI_VISITOR, USER } from "../../../web/src/core/actor"
import type { CoreCatalog } from "../../../web/src/core/core-catalog"
import type { ActionDef } from "../../../web/src/core/def/action"
import { type BackyardEntry, HOME_ID } from "../../../web/src/core/folders"
import { performIn } from "../../../web/src/core/perform-world"
import { readerOf, sourceOf } from "../../../web/src/core/record-source"
import type { Records } from "../../../web/src/core/records"
import { TICKETS_HISTORY } from "../../../web/src/plugins/base/library/backyards"
import { WORK_SUBJECTS_CHECK } from "../../../web/src/plugins/base/participant"
import { WORKER_BOOK, workerBookOf } from "../../../web/src/plugins/base/participant/worker-book"
import { roomKey, WORKROOM, YARD, yardCtx, yardWorld } from "../../backyard"
import { drawingPage, testBook } from "../../lineup"
import { CORE_CATALOG } from "../../support"

describe("認可ステップを直に問う", () => {
  // 種類 s が、レコード w（id はワークルーム）の ticket を作業中のチケット（種類 t。completesWork を持つ）として答える機能台帳
  const catalog = {
    ...CORE_CATALOG,
    subjects: new Map<string, unknown>([
      ["t", { completesWork: () => false }],
      [
        "s",
        {
          workroomWorkReads: ["w"],
          workroomWorkSubjects: ["t"],
          workroomWork: (room: string, read: { record(s: string, id: string): unknown }) => {
            const w = read.record("w", room) as { ticket?: string }
            return w?.ticket ? { kind: "working", key: { subject: "t", id: w.ticket } } : { kind: "idle" }
          },
        },
      ],
    ]),
  } as unknown as CoreCatalog
  const records = { w: { room: { ticket: "t1" } } } as unknown as Records
  const input = { catalog, read: readerOf(catalog, sourceOf(records), WORKER_BOOK.readsSubjects?.(catalog) ?? []) }
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
    expect(WORKER_BOOK.readsSubjects?.(catalog)).toEqual(["w", WORKROOM])
  })
})

describe("行うときに core が渡す物", () => {
  const add = (actor: Actor) =>
    performIn(
      yardWorld(),
      "@matomezu/base:page-add",
      { type: "@matomezu/drawing:drawing" },
      { book: "b1" },
      yardCtx(actor),
    )

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

describe("アノテーションは止めない", () => {
  const note = {
    id: "n1",
    annotation: "@matomezu/base:note",
    anchors: ["a"],
    props: { text: "見て", bubble: true, addedAt: "2026-11-21T00:00:00.000Z" },
  }
  const world = yardWorld()
  const box = { id: "a", item: "@matomezu/box:shape-nest-box", x: 0, y: 0, props: { caption: "a", body: "" } }
  const readNote = (actor: Actor) =>
    performIn(
      {
        ...world,
        pages: { ...world.pages, p1: drawingPage("p1", { items: [box] }) },
        annotations: { p1: [note] },
      } as never,
      "@matomezu/base:note-read",
      { note: "n1" },
      { page: "p1" },
      yardCtx(actor),
    )

  test("ほかのワークルームの AI も、ワーカーブックの伝言に答えられる", () => {
    expect(readNote({ kind: "ai", workroom: { id: "r2" } })).toMatchObject({ ok: true })
  })

  test("問いと確かめを直に問っても、アノテーションが対象のアクションは止めない", () => {
    const action = CORE_CATALOG.actions.get("@matomezu/base:note-read") as ActionDef
    const book = testBook("b1", "T1", [drawingPage("p1")])
    const other: Actor = { kind: "ai", workroom: { id: "other" } }
    const input = { catalog: CORE_CATALOG, read: readerOf(CORE_CATALOG, sourceOf({} as Records), []) }
    const backyardEntry: BackyardEntry = { backyard: TICKETS_HISTORY.id, workKey: { subject: "t", id: "t1" } }
    expect(WORKER_BOOK.denies({ kind: "folder", action, folder: book, actor: other, backyardEntry }, input)).toBe(false)
    expect(
      WORKER_BOOK.keeps?.(
        {
          kind: "folder",
          action,
          before: book,
          after: book,
          changes: { gone: false, place: "same", added: false, fields: [], lineup: false, pages: [] },
          backyardEntry: { before: backyardEntry, after: backyardEntry },
          actor: other,
        },
        input,
      ),
    ).toBe(true)
  })
})

describe("ワーカーブックにページを足す（worker-page-add）", () => {
  const ai = (room: string): Actor => ({ kind: "ai", workroom: { id: room } })
  const add = (actor: Actor, args: object = {}) =>
    performIn(
      yardWorld(),
      "@matomezu/base:worker-page-add",
      { type: "@matomezu/drawing:drawing", title: "メモ", ...args },
      undefined,
      yardCtx(actor),
    )
  type Rows = Record<string, { lineup: { id: string }[] } | undefined>
  const foldersOf = (done: ReturnType<typeof add>): Rows =>
    done.ok ? ((done.changes?.folders ?? {}) as unknown as Rows) : {}

  test("ブックが在れば、その最後に足す", () => {
    const done = add(ai("r1"))
    expect(done).toMatchObject({ ok: true, result: { book: "b1" } })
    const page = (done as { result: { page: string } }).result.page
    expect(foldersOf(done).b1?.lineup.map(r => r.id)).toEqual(["p1", page])
  })

  test("ブックが無ければ、ワークルームの名前で作り、workKey を付けてバックヤードの最後に置く（書庫ホームには入れない）", () => {
    const done = add(ai("r2"))
    expect(done.ok).toBe(true)
    const book = (done as { result: { book: string } }).result.book
    expect(foldersOf(done)[YARD]?.lineup as unknown[]).toEqual([
      { kind: "book", id: "b1", workKey: roomKey("r1") },
      { kind: "book", id: book, workKey: roomKey("r2") },
    ])
    expect(foldersOf(done)[HOME_ID]).toBeUndefined()
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
})

describe("ワーカーブックを持てる作業のレコードの種類", () => {
  // 種類 s が、ワークルームの作業として種類 kind の k1 を答え、workroomWorkSubjects に listed を書いた機能台帳
  // （種類 t は completesWork と workRecordName を持ち、u はどちらも持たず、v は completesWork だけ持つ）
  const catalogWith = (kind: string, listed: readonly string[]) =>
    ({
      ...CORE_CATALOG,
      subjects: new Map<string, unknown>([
        ["t", { id: "t", completesWork: () => false, workRecordName: () => ({ label: "K1", name: "k1" }) }],
        ["u", { id: "u" }],
        ["v", { id: "v", completesWork: () => false }],
        [
          "s",
          {
            id: "s",
            workroomWorkSubjects: listed,
            workroomWork: () => ({ kind: "working", key: { subject: kind, id: "k1" } }),
          },
        ],
      ]),
    }) as unknown as CoreCatalog
  const keyOf = (kind: string, listed: readonly string[]) => {
    const catalog = catalogWith(kind, listed)
    return workerBookOf(catalog, readerOf(catalog, sourceOf({}), []), "r1").workKey
  }

  test("workroomWorkSubjects に書いた、completesWork を持つ種類の作業なら、その作業のブック。ほかはワークルーム自身のブック", () => {
    expect(keyOf("t", ["t"])).toEqual({ subject: "t", id: "k1" })
    expect(keyOf("t", [])).toEqual({ subject: WORKROOM, id: "r1" })
    expect(keyOf("u", ["u"])).toEqual({ subject: WORKROOM, id: "r1" })
  })

  test("workroomWorkSubjects の種類が、台帳に無いか completesWork か workRecordName を持たなければ、台帳アセンブルで E133", () => {
    const codes = (listed: readonly string[]) => WORK_SUBJECTS_CHECK(catalogWith("t", listed)).map(p => p.code)
    expect(codes(["t"])).toEqual([])
    expect(codes(["u", "v", "none"])).toEqual(["E133", "E133", "E133"])
  })
})

describe("引継ぎページを書いて会話をリフレッシュする（refresh-request）", () => {
  const room = (id: string, extra: object = {}) => ({
    id,
    name: id,
    bird: "suzume",
    createdAt: "2026-11-01T00:00:00Z",
    ...extra,
  })
  // r2 の引継ぎ対象チケットは r1 の作業（r1 のワーカーブック b1 が在る）
  const ask = (opts: { target?: boolean; gone?: boolean; action?: string } = {}) => {
    const rooms = {
      ...(opts.gone ? {} : { r1: room("r1") }),
      r2: room("r2", opts.target === false ? {} : { handoffTarget: roomKey("r1") }),
    }
    return performIn(
      { ...yardWorld(), records: { [WORKROOM]: rooms } as never },
      opts.action ?? "@matomezu/base:refresh-request",
      { type: "@matomezu/drawing:drawing", title: "Handoff" },
      undefined,
      yardCtx({ kind: "ai", workroom: { id: "r2" } }),
    )
  }
  const lineupOf = (done: ReturnType<typeof ask>) =>
    done.ok
      ? (
          done.changes?.folders as unknown as Record<string, { lineup: { id: string }[] } | undefined> | undefined
        )?.b1?.lineup.map(e => e.id)
      : undefined

  test("引継ぎ対象チケットのワーカーブックの最後に引継ぎページを足し、そのページを読めと言う文のリフレッシュリクエストを返す", () => {
    const done = ask()
    expect(done.ok).toBe(true)
    const added = lineupOf(done)
    expect(added).toEqual(["p1", expect.any(String)])
    if (!done.ok) return
    expect(done.refreshRequest?.text).toContain(`page "${added?.[1]}" in book "b1"`)
    expect(done.refreshRequest?.text).toContain('read_folder with folder "my-workdesk"')
  })

  test("ほかのアクションでは、引継ぎ対象チケットのワーカーブックに書けない（worker-page-add は自分のワークルームのブックに書く）", () => {
    expect(lineupOf(ask({ action: "@matomezu/base:worker-page-add" }))).toBeUndefined()
    const direct = performIn(
      {
        ...yardWorld(),
        records: { [WORKROOM]: { r1: room("r1"), r2: room("r2", { handoffTarget: roomKey("r1") }) } } as never,
      },
      "@matomezu/base:page-add",
      { type: "@matomezu/drawing:drawing", title: "x" },
      { book: "b1" },
      yardCtx({ kind: "ai", workroom: { id: "r2" } }),
    )
    expect(direct).toMatchObject({ ok: false })
  })

  test("引継ぎ対象チケットが無い・そのレコードが消えたなら、理由を添えて断る。利用者には行えない", () => {
    expect(ask({ target: false })).toMatchObject({ ok: false, detail: expect.stringContaining("no handoff target") })
    expect(ask({ gone: true })).toMatchObject({ ok: false, detail: expect.stringContaining("is gone") })
    const byUser = performIn(
      {
        ...yardWorld(),
        records: { [WORKROOM]: { r1: room("r1"), r2: room("r2", { handoffTarget: roomKey("r1") }) } } as never,
      },
      "@matomezu/base:refresh-request",
      { type: "@matomezu/drawing:drawing", title: "x" },
      undefined,
      yardCtx(USER),
    )
    expect(byUser.ok).toBe(false)
  })
})

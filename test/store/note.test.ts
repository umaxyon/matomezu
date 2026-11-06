// 伝言（base のアノテーションの種類）: ブックのデータとは別に持ち、付ける・変える・消すのは利用者だけで、AI は読んだと知らせるだけ。
// ロック中のブックにも付けられ、画面の履歴に入らず、アンカーの物が全部無くなると消える
import { expect, test } from "bun:test"
import { z } from "zod"
import type { Annotation } from "../../web/src/core/annotation"
import { defineAction } from "../../web/src/core/def/action"
import { performIn } from "../../web/src/core/perform"
import type { BookOf } from "../../web/src/core/schema/book"
import { expiryOutlook } from "../../web/src/plugins/base/note/expiry"
import { cornerNotesByAnchor, nextReadNote, readNotesByAnchor } from "../../web/src/plugins/base/note/read-groups"
import { MASTER_BOOK } from "../../web/src/plugins/books/master"
import { CORE_CATALOG, newStore } from "../support"

type Drawing = BookOf<"@matomezu/drawing:drawing">
const ON = { book: "b1" }

// 見本のブック b1 の最初のページに箱を 2 つ置いた store
function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  const page = (store.state.getState().books.b1 as Drawing).pages[0]!.id
  const place = (x: number) =>
    store.actions.perform(
      "@matomezu/paper:item-place",
      { page, item: "@matomezu/box:shape-nest-box", at: { x, y: 40 }, props: { caption: "箱" } },
      ON,
    )
  const [a, b] = [place(40), place(400)].map(done => (done.ok ? (done.result as { item: string }).item : "")) as [
    string,
    string,
  ]
  const notes = (): readonly Annotation[] => store.state.getState().annotations.b1 ?? []
  return { store, page, a, b, notes }
}

const ADD = "@matomezu/base:note-add"
const UPDATE = "@matomezu/base:note-update"
const READ = "@matomezu/base:note-read"
const TALKED = "@matomezu/base:note-talked"
const REMOVE = "@matomezu/base:note-remove"

test("伝言を付けると、ブックとは別に持ち、id を返す。吹き出しは既定で出す。文が空か空白だけなら付けない（文の無い印はマーク）", () => {
  const { store, a, b, notes } = ready()
  const before = store.state.getState().books.b1
  const done = store.actions.perform(ADD, { anchors: [a, b], text: "見て" }, ON)
  expect(done).toMatchObject({ ok: true, result: { note: expect.any(String) } })
  expect(store.state.getState().books.b1).toBe(before)
  expect(notes()).toEqual([
    {
      id: done.ok ? (done.result as { note: string }).note : "",
      annotation: "@matomezu/base:note",
      anchors: [a, b],
      props: { text: "見て", bubble: true, addedAt: expect.any(String) },
    },
  ])
  expect(store.actions.perform(ADD, { anchors: [a], text: "" }, ON).ok).toBe(false)
  expect(store.actions.perform(ADD, { anchors: [a], text: " \n " }, ON).ok).toBe(false)
})

test("ブックに無い物や、ページそのものには伝言を付けられない", () => {
  const { store, page, notes } = ready()
  for (const anchors of [["nothing"], [page]])
    expect(store.actions.perform(ADD, { anchors, text: "x" }, ON)).toEqual({ ok: false, reason: "refused" })
  expect(notes()).toEqual([])
})

test("ロック中のブックにも伝言を付け・変え・消せる（ロックはアノテーションを止めない）", () => {
  const { store, a, notes } = ready()
  expect(store.actions.perform("@matomezu/base:book-lock", {}, ON).ok).toBe(true)
  expect(store.actions.perform(ADD, { anchors: [a], text: "x" }, ON).ok).toBe(true)
  const id = notes()[0]!.id
  expect(store.actions.perform(UPDATE, { note: id, text: "y" }, ON).ok).toBe(true)
  expect(store.actions.perform(REMOVE, { note: id }, ON).ok).toBe(true)
  expect(notes()).toEqual([])
})

test("伝言は画面の履歴に入らない", async () => {
  const { store, a } = ready()
  await Promise.resolve()
  const before = store.state.getState().history.b1
  store.actions.perform(ADD, { anchors: [a], text: "x" }, ON)
  await Promise.resolve()
  expect(store.state.getState().history.b1).toBe(before)
})

test("アンカーの物を消すとアンカーから外れ、全部消えると伝言も消える。Undo で物が戻っても伝言は戻らない", async () => {
  const { store, page, a, b, notes } = ready()
  await Promise.resolve()
  store.actions.perform(ADD, { anchors: [a, b], text: "x" }, ON)
  store.actions.perform(ADD, { anchors: [a], text: "y" }, ON)
  expect(store.actions.perform("@matomezu/paper:item-remove", { page, items: [a] }, ON).ok).toBe(true)
  expect(notes().map(n => n.anchors)).toEqual([[b]])
  await Promise.resolve()
  expect(store.actions.perform("@matomezu/paper:item-remove", { page, items: [b] }, ON).ok).toBe(true)
  expect(notes()).toEqual([])
  expect(store.state.getState().annotations).toEqual({})
  await Promise.resolve()
  expect(store.actions.command("s1", "@matomezu/base:undo")).toBe(true)
  expect((store.state.getState().books.b1 as Drawing).pages[0]!.items!.map(i => i.id)).toContain(b)
  expect(notes()).toEqual([])
})

test("AI が読んだと知らせると既読になり、伝言は残る。既読のものは既読にできない", () => {
  const { store, a, notes } = ready()
  store.actions.perform(ADD, { anchors: [a], text: "読んで" }, ON)
  const id = notes()[0]!.id
  expect(store.actions.perform(READ, { note: id }, ON).ok).toBe(true)
  expect(notes().map(n => n.id)).toEqual([id])
  expect((notes()[0]!.props as { readAt?: string }).readAt).toBeString()
  expect(store.actions.perform(READ, { note: id }, ON).ok).toBe(false)
})

test("文を変えると未読に戻る。吹き出しだけを変えても既読のまま。何も変わらなければ断る", () => {
  const { store, a, notes } = ready()
  store.actions.perform(ADD, { anchors: [a], text: "直して" }, ON)
  const id = notes()[0]!.id
  const props = () => notes()[0]!.props as { text: string; bubble: boolean; readAt?: string }
  store.actions.perform(READ, { note: id }, ON)
  expect(store.actions.perform(UPDATE, { note: id, bubble: true }, ON).ok).toBe(false)
  expect(store.actions.perform(UPDATE, { note: id, text: "直して" }, ON).ok).toBe(false)
  expect(store.actions.perform(UPDATE, { note: id, bubble: false }, ON).ok).toBe(true)
  expect(props()).toMatchObject({ bubble: false, readAt: expect.any(String) })
  expect(store.actions.perform(UPDATE, { note: id, text: "やっぱり" }, ON).ok).toBe(true)
  expect(props().text).toBe("やっぱり")
  expect(props().readAt).toBeUndefined()
})

test("マスターには伝言を付けられない（タイプが種類を外している）", () => {
  const { store } = ready()
  expect(store.actions.perform(ADD, { anchors: ["x"], text: "x" }, { book: MASTER_BOOK.id }).ok).toBe(false)
})

test("ブックを消すと、そのブックの伝言も消える", () => {
  const { store, a, notes } = ready()
  store.actions.perform(ADD, { anchors: [a], text: "x" }, ON)
  expect(store.actions.perform("@matomezu/base:book-trash", { book: "b1" }).ok).toBe(true)
  expect(notes()).toHaveLength(1)
  expect(store.actions.perform("@matomezu/base:book-purge", { books: ["b1"] }).ok).toBe(true)
  expect(store.state.getState().annotations).toEqual({})
})

test("AI は伝言を付け・変え・消せない（利用者だけ）が、読んだと知らせられる", () => {
  const { store, a, notes } = ready()
  store.actions.perform(ADD, { anchors: [a], text: "x" }, ON)
  const id = notes()[0]!.id
  const s = store.state.getState()
  const world = { books: s.books, settings: s.settings, annotations: s.annotations, mailbox: [] }
  const ctx = { catalog: CORE_CATALOG, home: null, lang: "en" as const, newId: () => "n", now: "t", by: "ai" as const }
  const ai = (action: string, args: unknown) => performIn(world, action, args, ON, ctx)
  const refused = { ok: false, reason: "not-allowed" } as const
  expect(ai(ADD, { anchors: [a], text: "y" })).toEqual(refused)
  expect(ai(UPDATE, { note: id, text: "y" })).toEqual(refused)
  expect(ai(REMOVE, { note: id })).toEqual(refused)
  expect(ai(READ, { note: id }).ok).toBe(true)
})

test("付ける先を変えられる（吹き出しは最後の物のそば）。付ける先だけ変えても未読に戻る。ブックに無い物には変えられない", () => {
  const { store, a, b, notes } = ready()
  store.actions.perform(ADD, { anchors: [a], text: "見て" }, ON)
  const id = notes()[0]!.id
  store.actions.perform(READ, { note: id }, ON)
  expect(store.actions.perform(UPDATE, { note: id, anchors: [a] }, ON).ok).toBe(false)
  expect(store.actions.perform(UPDATE, { note: id, anchors: [b, a] }, ON).ok).toBe(true)
  expect(notes()[0]!.anchors).toEqual([b, a])
  expect((notes()[0]!.props as { readAt?: string }).readAt).toBeUndefined()
  expect(store.actions.perform(UPDATE, { note: id, anchors: ["nothing"] }, ON).ok).toBe(false)
  expect(store.actions.perform(UPDATE, { note: id, text: "直した", anchors: [b] }, ON).ok).toBe(true)
  expect(notes()[0]).toMatchObject({ anchors: [b], props: { text: "直した" } })
  expect((notes()[0]!.props as { readAt?: string }).readAt).toBeUndefined()
})

test("話しかけたとき（note-talked）は、読まれていて会話の時点の無い伝言にだけ会話の時点を付ける。文を変えると会話の時点も外れる。AI は行えない", () => {
  const { store, a, b, notes } = ready()
  store.actions.perform(ADD, { anchors: [a], text: "読まれた" }, ON)
  store.actions.perform(ADD, { anchors: [b], text: "まだ" }, ON)
  const [read] = notes().map(n => n.id) as [string]
  store.actions.perform(READ, { note: read }, ON)
  expect(store.actions.perform(TALKED, {}, ON).ok).toBe(true)
  const props = () => notes().map(n => (n.props as { talkedAt?: string }).talkedAt)
  expect(props()[0]).toBeString()
  expect(props()[1]).toBeUndefined()
  // もう付いていれば、変える物が無いので断る
  expect(store.actions.perform(TALKED, {}, ON).ok).toBe(false)
  expect(store.actions.perform(UPDATE, { note: read, text: "直した" }, ON).ok).toBe(true)
  expect(props()[0]).toBeUndefined()
})

test("話しかけたときに行うアクションは、アノテーションが対象のアクションだけが名乗れる（型で止める）", () => {
  const talks = defineAction({
    id: "@x/t:talk",
    title: "@matomezu/base:Note",
    aiDescription: "t",
    target: "annotations",
    runsWhenUserTalks: true,
    args: z.strictObject({}),
    run: () => null,
  })
  expect(talks.runsWhenUserTalks).toBe(true)
  defineAction({
    id: "@x/t:book",
    title: "@matomezu/base:Note",
    aiDescription: "t",
    target: "book",
    // @ts-expect-error ブックが対象のアクションは、話しかけたときに行えない
    runsWhenUserTalks: true,
    args: z.strictObject({}),
    run: () => null,
  })
})

test("読まれた伝言が消えるまでの見込み: 話しかけるまでは設定の時間、数え始めたら残り（切り上げ、過ぎたら 0）。読まれていない・消さない設定は無い", () => {
  const now = new Date("2026-11-06T10:00:00.000Z")
  expect(expiryOutlook({}, "60", now)).toBeNull()
  expect(expiryOutlook({ readAt: "2026-11-06T09:00:00.000Z" }, "never", now)).toBeNull()
  expect(expiryOutlook({ readAt: "2026-11-06T09:00:00.000Z" }, "480", now)).toEqual({
    kind: "after-talk",
    minutes: 480,
  })
  const talked = { readAt: "2026-11-06T09:00:00.000Z", talkedAt: "2026-11-06T09:30:30.000Z" }
  expect(expiryOutlook(talked, "60", now)).toEqual({ kind: "left", minutes: 31 })
  expect(expiryOutlook(talked, "15", now)).toEqual({ kind: "left", minutes: 0 })
  // 形に合わない設定は既定（60 分）
  expect(expiryOutlook(talked, "bad", now)).toEqual({ kind: "left", minutes: 31 })
})

test("既読の伝言は、チェックを出す物（付けた物の最後）ごとに新しい順にまとめる。未読は入らず、付けた時点が同じなら後ろの物が新しい", () => {
  const note = (id: string, anchors: string[], addedAt: string, read = true): Annotation =>
    ({
      id,
      annotation: "@matomezu/base:note",
      anchors,
      props: { text: id, bubble: true, addedAt, ...(read ? { readAt: addedAt } : {}) },
    }) as unknown as Annotation
  const groups = readNotesByAnchor([
    note("old", ["x"], "2026-11-06T01:00:00.000Z"),
    note("new", ["y", "x"], "2026-11-06T03:00:00.000Z"),
    note("unread", ["x"], "2026-11-06T04:00:00.000Z", false),
    note("other", ["y"], "2026-11-06T02:00:00.000Z"),
    note("same", ["x"], "2026-11-06T01:00:00.000Z"),
  ])
  expect([...groups.keys()]).toEqual(["x", "y"])
  expect(groups.get("x")?.map(n => n.id)).toEqual(["new", "same", "old"])
  expect(groups.get("y")?.map(n => n.id)).toEqual(["other"])
})

test("物の右上の角には、たたんだ未読の伝言と既読の伝言を、物ごとに 1 つの並びにまとめる。吹き出しを出す未読の伝言は入らない", () => {
  const note = (id: string, anchor: string, kind: "read" | "folded" | "bubble"): Annotation =>
    ({
      id,
      annotation: "@matomezu/base:note",
      anchors: [anchor],
      props: {
        text: id,
        bubble: kind !== "folded",
        addedAt: "2026-11-06T01:00:00.000Z",
        ...(kind === "read" ? { readAt: "2026-11-06T02:00:00.000Z" } : {}),
      },
    }) as unknown as Annotation
  const corners = cornerNotesByAnchor([
    note("f1", "x", "folded"),
    note("r1", "x", "read"),
    note("b1", "y", "bubble"),
    note("f2", "x", "folded"),
    note("f3", "z", "folded"),
    note("r2", "w", "read"),
  ])
  expect([...corners.keys()]).toEqual(["x", "z", "w"])
  expect(corners.get("x")?.folded.map(n => n.id)).toEqual(["f1", "f2"])
  expect(corners.get("x")?.read.map(n => n.id)).toEqual(["r1"])
  expect(corners.get("z")).toMatchObject({ read: [] })
  expect(corners.get("w")?.folded).toEqual([])
  expect(corners.get("w")?.read.map(n => n.id)).toEqual(["r2"])
})

test("開いていた既読の伝言が無くなったら、残った中で同じ物にチェックを出すいちばん新しい既読の伝言を開く（無ければ無い）", () => {
  const note = (id: string, anchors: string[], addedAt: string, read = true): Annotation =>
    ({
      id,
      annotation: "@matomezu/base:note",
      anchors,
      props: { text: id, bubble: true, addedAt, ...(read ? { readAt: addedAt } : {}) },
    }) as unknown as Annotation
  const left = [
    note("old", ["x"], "2026-11-06T01:00:00.000Z"),
    note("mid", ["y", "x"], "2026-11-06T02:00:00.000Z"),
    note("unread", ["x"], "2026-11-06T04:00:00.000Z", false),
  ]
  expect(nextReadNote(left, "x")?.id).toBe("mid")
  expect(nextReadNote(left, "y")).toBeUndefined()
})

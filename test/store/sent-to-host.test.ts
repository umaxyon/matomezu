// 画面が中身を持っていない行を読むアクションは、画面で先に行わずに常駐へ送る（id は常駐が振り、結果は confirmed で常駐の答えを待つ）。
// 同じアクションバルクの後ろのアクションも送る。ホストが無ければ断る。行い直しは、送ったアクションの手前までを残す

import { expect, test } from "bun:test"
import { z } from "zod"
import { pagesOf } from "../../web/src/core/book"
import { pageMetaRowOf } from "../../web/src/core/folders"
import { LIBRARY_HISTORY } from "../../web/src/core/history"
import { defineMessages } from "../../web/src/core/i18n/messages"
import type { AnyPage } from "../../web/src/core/schema/book"
import { BUILTIN } from "../../web/src/plugins"
import { libraryRevertArgs } from "../../web/src/plugins/base/library/revert"
import { SENT_TO_HOST } from "../../web/src/store/actions"
import { pluginKit } from "../../web/src/store/kit"
import type { DoneBulk, HostAnswer } from "../../web/src/store/state"
import { drawingPage, testBook } from "../lineup"
import { type newStore, sizedStore, worldRows } from "../support"

const BOX = "@matomezu/box:shape-nest-box"
const PLACE = "@matomezu/paper:item-place"
const UPDATE = "@matomezu/base:page-update"
const settled = () => Promise.resolve()
type Store = ReturnType<typeof newStore>
const captionsOf = (store: Store) =>
  (pagesOf(store.state.getState().books.b1!)[0]?.items ?? []).map(i => (i.props as { caption: string }).caption)
const place = (store: Store, x: number, caption: string) =>
  store.actions.perform(PLACE, { item: BOX, at: { x, y: 40 }, props: { caption } }, { page: "p1" })
const rename = (store: Store) => store.actions.perform(UPDATE, { title: "改" }, { page: "q1" })

// b1 は中身を持ち、b2 の q1 はページメタだけの世界
function worldWithMeta(store: Store) {
  const rows = worldRows([store.state.getState().books.b1, testBook("b2", "B", [drawingPage("q1", { title: "設計" })])])
  return {
    pages: rows.pages.map(p => ((p as { id: string }).id === "q1" ? pageMetaRowOf(p as AnyPage) : p)),
    folders: rows.folders,
    settings: {},
  }
}

// 自分だけのアクションバルクで送る（bulk: "alone"）、引数のブックを読むレコードのアクション（追加プラグインの見本）
const kit = pluginKit("touches", defineMessages({ touched: { en: "Touched", ja: "触った" } }))
const TOUCHED = kit.defineSubject({
  id: "touched",
  title: "touched",
  aiDescription: "A touched mark.",
  record: z.strictObject({ id: z.string() }),
})
const TOUCH = kit.defineAction({
  id: "touch",
  title: "touched",
  aiDescription: "Touch the mark.",
  target: TOUCHED.id,
  bulk: "alone",
  args: z.strictObject({ book: z.string() }),
  readsBooks: (args: { book: string }) => [args.book],
  run: (now: unknown) => (now === "none" ? null : { next: now, result: { touched: true } }),
  // 機能台帳の型（core/catalog.ts）に書き足さない、試しのプラグインの種類なので、型は通さない
} as never)
const touches = kit.plugin({ subjects: [TOUCHED], actions: [TOUCH] })

function observed(answer: (bulk: DoneBulk) => HostAnswer = () => ({ ok: true })) {
  const sent: DoneBulk[] = []
  const store = sizedStore({
    observe: (bulk: DoneBulk) => {
      sent.push(bulk)
      return Promise.resolve(answer(bulk))
    },
    plugins: [...BUILTIN, touches],
  } as never)
  store.receive(worldWithMeta(store), [])
  return { store, sent }
}

test("中身を持っていない行を読むアクションは、状態を変えずに、id を空にして送り、SENT_TO_HOST を返す", async () => {
  const { store, sent } = observed()
  const before = store.state.getState().pages
  const history = store.state.getState().history
  const done = rename(store)
  expect(done).toMatchObject({ ok: true, result: SENT_TO_HOST })
  expect(store.state.getState().pages).toBe(before)
  await settled()
  // 送っただけのバルクは、画面の履歴に段を残さない
  expect(store.state.getState().history).toEqual(history)
  expect(sent).toHaveLength(1)
  expect(sent[0]![0]).toMatchObject({ action: UPDATE, ids: [], on: { page: "q1" } })
})

test("同じ流れで送ったアクションの後ろは、画面で行えるアクションも先に行わずに送る（手前は先に行う）", async () => {
  const { store, sent } = observed()
  expect(place(store, 40, "一")).toMatchObject({ ok: true })
  expect(rename(store)).toMatchObject({ result: SENT_TO_HOST })
  expect(place(store, 300, "二")).toMatchObject({ ok: true, result: SENT_TO_HOST })
  expect(captionsOf(store)).toEqual(["一"])
  await settled()
  expect(sent.map(b => b.map(d => d.action))).toEqual([[PLACE, UPDATE, PLACE]])
  // 次の流れは、また画面で先に行う
  expect(place(store, 560, "三").ok && captionsOf(store)).toEqual(["一", "三"])
})

test("confirmed は、常駐が返したそのアクションの結果で答え、常駐が断れば断りで答える", async () => {
  const ok = observed(bulk => ({ ok: true, results: bulk.map((_, i) => ({ at: i })) }))
  place(ok.store, 40, "一")
  const done = rename(ok.store)
  if (!done.ok || !("confirmed" in done)) throw new Error("not sent")
  expect(await done.confirmed).toEqual({ ok: true, result: { at: 1 } as never })
  const ng = observed(() => ({ ok: false, reason: "refused" }))
  const refused = rename(ng.store)
  if (!refused.ok || !("confirmed" in refused)) throw new Error("not sent")
  expect(await refused.confirmed).toEqual({ ok: false, reason: "refused", by: "host" })
  expect(await ng.store.actions.performConfirmed(UPDATE, { title: "改" }, { page: "q1" })).toMatchObject({
    ok: false,
    by: "host",
  })
})

test("ホストが無ければ、中身を持っていない行を読むアクションは断る", () => {
  const store = sizedStore()
  store.receive(worldWithMeta(store), [])
  expect(rename(store)).toMatchObject({ ok: false, reason: "refused" })
})

test("行い直しは、送ったアクションで止まったバルクの手前を残す", async () => {
  const { store, sent } = observed()
  const world = worldWithMeta(store)
  place(store, 40, "一")
  rename(store)
  await settled()
  store.receive(world, [sent[0]!])
  expect(captionsOf(store)).toEqual(["一"])
})

test("自分だけのアクションバルクのアクションも送り、開いているアクションバルクの後ろに回し、confirmed はその 1 つ目の結果で答える", async () => {
  const { store, sent } = observed(bulk => ({ ok: true, results: bulk.map(d => ({ of: d.action })) }))
  place(store, 40, "一")
  const done = (store.actions.perform as (id: string, args: unknown, on: unknown) => unknown)(
    TOUCH.id,
    { book: "b2" },
    { record: "m1" },
  )
  if (!(done as { ok: boolean }).ok || !(typeof done === "object" && done !== null && "confirmed" in done))
    throw new Error("not sent")
  expect(await (done as { confirmed: Promise<unknown> }).confirmed).toEqual({ ok: true, result: { of: TOUCH.id } })
  expect(sent.map(b => b.map(d => d.action))).toEqual([[PLACE], [TOUCH.id]])
  expect(sent[1]![0]).toMatchObject({ ids: [], on: { record: "m1" } })
})

// 段 3b: 先に行わずに送ったバルクの書庫の履歴の段は、常駐が答えた前と後で入れる（画面のページメタを前の値にしない）
const TRASH = "@matomezu/base:entry-trash"
const libraryHistory = (store: Store) => store.state.getState().history[LIBRARY_HISTORY] ?? { undo: [], redo: [] }
const trashed = (bulk: DoneBulk): HostAnswer => ({
  ok: true,
  results: bulk.map(() => ({})),
  library: {
    pages: { q1: { before: { id: "q1", body: "常駐の中身" }, after: { id: "q1", body: "常駐の中身", trashed: true } } },
    folders: {},
  },
})

test("送ったバルクの書庫の段は、常駐の答えを待ち、常駐が答えた前と後で書庫の履歴に入れる", async () => {
  const { store, sent } = observed(trashed)
  expect(store.actions.perform(TRASH, { entry: "b2" })).toMatchObject({ ok: true, result: SENT_TO_HOST })
  expect(libraryHistory(store).undo).toEqual([])
  await settled()
  await settled()
  expect(sent.map(b => b.map(d => d.action))).toEqual([[TRASH]])
  expect(libraryHistory(store).undo).toMatchObject([
    {
      by: "user",
      pages: { q1: { before: { body: "常駐の中身" }, after: { trashed: true } } },
      folders: {},
    },
  ])
})

test("送ったバルクを常駐が断ったら、書庫の履歴に段を入れない", async () => {
  const { store } = observed(() => ({ ok: false, reason: "refused" }))
  store.actions.perform(TRASH, { entry: "b2" })
  await settled()
  await settled()
  expect(libraryHistory(store).undo).toEqual([])
})

test("送ったバルクの書庫の段は、答えを待つ間に入れた段より前に、始めた順の位置で入る", async () => {
  let release: (a: HostAnswer) => void = () => {}
  const sent: DoneBulk[] = []
  const store = sizedStore({
    observe: (bulk: DoneBulk) => {
      sent.push(bulk)
      return sent.length === 1 ? new Promise<HostAnswer>(r => (release = r)) : Promise.resolve(trashed(bulk))
    },
    plugins: [...BUILTIN, touches],
  } as never)
  store.receive(worldWithMeta(store), [])
  store.actions.perform(TRASH, { entry: "b2" })
  await settled()
  store.actions.perform(TRASH, { entry: "b2" })
  await settled()
  await settled()
  const later = libraryHistory(store).undo
  expect(later).toHaveLength(1)
  release(trashed(sent[0]!))
  await settled()
  await settled()
  const undo = libraryHistory(store).undo
  expect(undo).toHaveLength(2)
  expect(undo[1]).toBe(later[0]!)
  expect(undo[0]!.seq).toBeLessThan(undo[1]!.seq)
})

test("送った書庫の段を戻すと、置き直しも先に行わずに送り、断られたら段を戻せる側へ戻す", async () => {
  let refuse = false
  const { store, sent } = observed(bulk => (refuse ? { ok: false, reason: "refused" } : trashed(bulk)))
  store.actions.perform(TRASH, { entry: "b2" })
  await settled()
  await settled()
  const step = libraryHistory(store).undo[0]!
  refuse = true
  const back = store.actions.perform("@matomezu/base:library-revert", libraryRevertArgs(step, "before"))
  expect(back).toMatchObject({ ok: true, result: SENT_TO_HOST })
  store.actions.moveHistory(LIBRARY_HISTORY, "undo")
  expect(libraryHistory(store)).toMatchObject({ undo: [], redo: [step] })
  await settled()
  await settled()
  expect(sent.at(-1)?.map(d => d.action)).toEqual(["@matomezu/base:library-revert"])
  expect(libraryHistory(store)).toMatchObject({ undo: [step], redo: [] })
})

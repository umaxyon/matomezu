// アクションバルク: 画面が同期の 1 回の流れで行ったアクションは、画面の履歴の段と同じ区切りで 1 つにまとめて observe に渡す。
// ホストが断れば、その段を画面の履歴から外し、同じバルクの performConfirmed はどれも断りを受ける。行い直しは、バルクごとに全部か無し

import { expect, test } from "bun:test"
import { pagesOf } from "../../web/src/core/book"
import type { DoneBulk, HostAnswer } from "../../web/src/store/store"
import { newStore, sizedStore, worldRows } from "../support"

const BOX = "@matomezu/box:shape-nest-box"
const PLACE = "@matomezu/paper:item-place"
const settled = () => Promise.resolve()
type Store = ReturnType<typeof newStore>
const captionsOf = (store: Store) =>
  (pagesOf(store.state.getState().books.b1!)[0]?.items ?? []).map(i => (i.props as { caption: string }).caption)
const place = (store: Store, x: number, caption: string) =>
  store.actions.perform(PLACE, { item: BOX, at: { x, y: 40 }, props: { caption } }, { page: "p1" })

// 送られたバルクを溜め、答えを answer で決める store
function observed(answer: (bulk: DoneBulk) => HostAnswer = () => ({ ok: true })) {
  const sent: DoneBulk[] = []
  const store = sizedStore({
    observe: bulk => {
      sent.push(bulk)
      return Promise.resolve(answer(bulk))
    },
  })
  return { store, sent }
}

test("同じ流れで行ったアクションは、流れが終わってから 1 つのバルクで送り、次の流れは別のバルクになる", async () => {
  const { store, sent } = observed()
  place(store, 40, "一")
  place(store, 300, "二")
  expect(sent).toHaveLength(0)
  await settled()
  expect(sent.map(b => b.map(d => d.action))).toEqual([[PLACE, PLACE]])
  place(store, 560, "三")
  await settled()
  expect(sent.map(b => b.length)).toEqual([2, 1])
})

test("コマンドは走る前に画面の履歴の段を閉じるので、その前のアクションとは別のバルクになる", async () => {
  const { store, sent } = observed()
  place(store, 40, "一")
  expect(store.actions.command("s1", "@matomezu/base:undo")).toBe(true)
  await settled()
  expect(sent.map(b => b.map(d => d.action))).toEqual([[PLACE], ["@matomezu/base:book-revert"]])
})

test("ホストがバルクを断ったら、その画面の履歴の段は外れ、同じバルクの performConfirmed はどれも断りを受ける", async () => {
  const { store } = observed(bulk => (bulk.length > 1 ? { ok: false, reason: "refused" } : { ok: true }))
  const first = store.actions.performConfirmed(PLACE, { item: BOX, at: { x: 40, y: 40 }, props: { caption: "一" } }, { page: "p1" })
  const second = store.actions.performConfirmed(PLACE, { item: BOX, at: { x: 300, y: 40 }, props: { caption: "二" } }, { page: "p1" })
  expect(await first).toMatchObject({ ok: false, reason: "refused", by: "host" })
  expect(await second).toMatchObject({ ok: false, reason: "refused", by: "host" })
  expect(store.state.getState().history.b1?.undo ?? []).toHaveLength(0)
})

test("行い直しは、バルクの中の 1 つが行えなければ、そのバルクを丸ごと落とし、あとのバルクは続ける", async () => {
  const { store, sent } = observed()
  const world = { ...worldRows([store.state.getState().books.b1]), settings: {} }
  place(store, 40, "一")
  await settled()
  place(store, 300, "二")
  store.actions.perform("@matomezu/base:page-update", { title: "改" }, { page: "p1" })
  await settled()
  const [one, two] = sent as [DoneBulk, DoneBulk]
  // 2 つ目のバルクの 2 つ目のアクションが、確かめた世界では行えない（ページが無い）
  const broken: DoneBulk = [two[0]!, { ...two[1]!, on: { page: "无" } }]
  store.receive(world, [one, broken])
  expect(captionsOf(store)).toEqual(["一"])
  expect(store.state.getState().books.b1?.lineup[0]).not.toMatchObject({ title: "改" })
})

// スクラップトレイ（base の対象の定義 scrap）: 切り抜くとレコードが 1 件でき、消すと無くなる。行えるのは利用者だけ。置いたときの大きさは、見る範囲 × 倍率
import { expect, test } from "bun:test"
import { AI } from "../../../web/src/core/actor"
import { performIn } from "../../../web/src/core/perform"
import { scrapFrameIn } from "../../../web/src/plugins/base/scrap"
import { SCRAP, scrapSize } from "../../../web/src/plugins/base/scrap/scrap"
import { CORE_CATALOG, newStore } from "../../support"

const CUT = "@matomezu/base:scrap-cut"
const REMOVE = "@matomezu/base:scrap-remove"
const ONE = { page: "p1", area: { x: 10, y: 20, w: 400, h: 200 }, scale: 0.5 }

function ready() {
  const store = newStore()
  const perform = store.actions.perform as (id: string, args: unknown, on?: { record: string }) => { ok: boolean }
  const tray = () => Object.values(store.state.getState().records[SCRAP.id] ?? {}) as { id: string }[]
  return { store, perform, tray }
}

test("切り抜くとスクラップトレイにスクラップが 1 つ入り（指すページがあるかは確かめない）、消すと無くなる", () => {
  const { perform, tray } = ready()
  expect(perform(CUT, ONE).ok).toBe(true)
  expect(perform(CUT, { ...ONE, page: "nothing" }).ok).toBe(true)
  expect(tray()).toHaveLength(2)
  expect(tray()[0]).toMatchObject(ONE)
  expect(perform(REMOVE, {}, { record: tray()[0]!.id }).ok).toBe(true)
  expect(tray()).toHaveLength(1)
})

test("形に合わない値（倍率が範囲の外・大きさが 0）は断る", () => {
  const { perform, tray } = ready()
  expect(perform(CUT, { ...ONE, scale: 0 }).ok).toBe(false)
  expect(perform(CUT, { ...ONE, area: { ...ONE.area, w: 0 } }).ok).toBe(false)
  expect(tray()).toHaveLength(0)
})

test("AI は切り抜くことも消すこともできない", () => {
  const { store, perform, tray } = ready()
  perform(CUT, ONE)
  const s = store.state.getState()
  const world = {
    books: s.books,
    settings: s.settings,
    annotations: s.annotations,
    records: s.records,
    counters: s.counters,
  }
  const ctx = {
    catalog: CORE_CATALOG,
    controlCenter: "@matomezu/control-center:control-center" as never,
    lang: "en" as const,
    newId: () => "n",
    now: "t",
    actor: AI,
  }
  const refused = { ok: false, reason: "not-allowed" } as const
  expect(performIn(world, CUT, ONE, undefined, ctx)).toEqual(refused)
  expect(performIn(world, REMOVE, {}, { record: tray()[0]!.id }, ctx)).toEqual(refused)
})

test("置いたときの大きさは、見る範囲 × 倍率（小数は切り上げ）", () => {
  expect(scrapSize(ONE)).toEqual({ w: 200, h: 100 })
  expect(scrapSize({ area: { x: 0, y: 0, w: 101, h: 33 }, scale: 0.5 })).toEqual({ w: 51, h: 17 })
})

test("スクラップフレームは、ブックのタイプが置けるアイテムのうち scrapFrame の付いた物（図面・フローチャートはスクラップボックス、ツリーには無い）", () => {
  const { store } = ready()
  const catalog = store.catalog.core
  const book = (type: string) => ({ id: "x", title: "x", type, pages: [] }) as never
  expect(scrapFrameIn(catalog, book("@matomezu/drawing:drawing"), "items")).toBe("@matomezu/scrap:shape-scrap-box")
  expect(scrapFrameIn(catalog, book("@matomezu/flowchart:flowchart"), "items")).toBe("@matomezu/scrap:shape-scrap-box")
  expect(scrapFrameIn(catalog, book("@matomezu/tree:tree"), "items")).toBeNull()
})

test("切り抜くコマンドは、開いているページ（ページタブなら渡されたページ）で切り抜くダイアログを開く", () => {
  const { store } = ready()
  store.actions.openBook("s1", "b1")
  expect(store.actions.command("s1", "@matomezu/base:scrap-cut", {})).toBe(true)
  expect(store.state.getState().dialog).toMatchObject({ id: "@matomezu/base:scrap-cut", args: { page: "p1" } })
  store.actions.closeDialog()
  expect(store.actions.command("s1", "@matomezu/base:scrap-cut", { page: "other" })).toBe(true)
  expect(store.state.getState().dialog).toMatchObject({ args: { page: "other" } })
})

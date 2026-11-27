// スクラップトレイ（base の対象の定義 scrap）: 切り抜くとレコードが 1 件でき、消すと無くなる。行えるのは利用者だけ。置いたときの大きさは、見る範囲 × 倍率
import { expect, test } from "bun:test"
import { AI } from "../../../web/src/core/actor"
import { performIn } from "../../../web/src/core/perform-world"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { scrapFrameIn } from "../../../web/src/plugins/base/scrap"
import {
  SCRAP,
  scrapScaleFits,
  scrapScaleMin,
  scrapSize,
  scrapToPlace,
} from "../../../web/src/plugins/base/scrap/scrap"
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
    pages: s.pages,
    folders: s.folders,
    settings: s.settings,
    annotations: s.annotations,
    records: s.records,
    counters: s.counters,
  }
  const ctx = {
    catalog: CORE_CATALOG,
    controlCenter: BUILTIN_CONTROL_CENTER as never,
    lang: "en" as const,
    newId: () => "n",
    now: "t",
    today: "2026-01-01",
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

test("スクラップフレームは、ページのタイプが置けるアイテムのうち scrapFrame の付いた物（図面・フローチャートはスクラップボックス、ツリーには無い）", () => {
  const { store } = ready()
  const catalog = store.catalog.core
  expect(scrapFrameIn(catalog, "@matomezu/drawing:drawing", "items")).toBe("@matomezu/scrap:shape-scrap-box")
  expect(scrapFrameIn(catalog, "@matomezu/flowchart:flowchart", "items")).toBe("@matomezu/scrap:shape-scrap-box")
  expect(scrapFrameIn(catalog, "@matomezu/tree:tree", "items")).toBeNull()
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

test("スクラップトレイから置くときは、紙の幅・高さの半分に収まるよう倍率を下げる（小さい切り抜きは上げない。下限より下げない）", () => {
  const paper = { w: 1000, h: 800 }
  const of = (w: number, h: number) => scrapToPlace({ page: "p", area: { x: 0, y: 0, w, h }, scale: 1 }, paper).scale
  expect(of(1000, 800)).toBe(0.5)
  expect(of(2000, 400)).toBe(0.25) // 幅で決まる
  expect(of(200, 100)).toBe(1) // 収まっていれば、そのまま
  expect(of(6000, 4000)).toBeCloseTo(500 / 6000, 9) // 大きな写真も、紙の半分まで縮める
  expect(of(50000, 100)).toBe(0.24) // 倍率の下限: 置いた短い辺が 24px
})

test("倍率の下限は見る範囲で決まる: 置いた短い辺が 24px になる倍率（等倍でも届かない小さな範囲は等倍）", () => {
  expect(scrapScaleMin({ w: 6000, h: 4000 })).toBe(0.006)
  expect(scrapScaleMin({ w: 10, h: 300 })).toBe(1)
  const scrap = (scale: number) => ({ page: "p", area: { x: 0, y: 0, w: 4000, h: 2400 }, scale })
  expect(scrapScaleFits(scrap(0.01))).toBe(true)
  expect(scrapScaleFits(scrap(0.009))).toBe(false)
})

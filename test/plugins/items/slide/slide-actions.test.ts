// スライドのページ: ページの slide にアイテムを置く・動かす・大きさを変える・項目を変える・重ねを変える・消す（plugins/items/slide）

import { expect, test } from "bun:test"
import { pagesOf } from "../../../../web/src/core/book"
import { HOME_ID } from "../../../../web/src/core/folders"
import { NO_PAPER } from "../../../../web/src/core/stage"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../../../web/src/plugins"
import { createBookIn } from "../../../../web/src/plugins/base"
import {
  SLIDE_MOVE,
  SLIDE_PLACE,
  SLIDE_REMOVE,
  SLIDE_REORDER,
  SLIDE_RESIZE,
  SLIDE_UPDATE,
} from "../../../../web/src/plugins/items/slide/actions"
import { SLIDE_DROP, SLIDE_SET } from "../../../../web/src/plugins/items/slide/commands"
import { createMatomezu } from "../../../../web/src/store/create"
import { SLIDE, testBinder, testBook, testPage, withSlide } from "../../../lineup"
import { newStore, sequence } from "../../../support"

const TEXT = "@matomezu/slide:slide-text"
const ELLIPSE = "@matomezu/slide:slide-ellipse"
const RECTANGLE = "@matomezu/slide:slide-rectangle"
const LINE = "@matomezu/slide:slide-line"
const FREE = "@matomezu/slide:slide-free-line"

// 何も置いていないスライドのページ p1 を、バインダ 1 つに入れたブック b1
const slideBook = () =>
  testBook("b1", "スライド", [
    testBinder(
      "b1-slides",
      "スライド",
      SLIDE,
      withSlide(testPage(SLIDE, "p1", { title: "1", paper: "@matomezu/base:ratio-16x9" }), []),
    ),
  ])

function setup() {
  const instance = createMatomezu({
    plugins: BUILTIN,
    controlCenter: BUILTIN_CONTROL_CENTER,
    newId: sequence(),
  })
  // スライドのバインダに 1 枚入れたブックを作る
  createBookIn(instance, "s1", {
    into: HOME_ID,
    title: "スライド",
    page: { type: "@matomezu/slide-page:slide", title: "1", into: { newBinder: "スライド" } },
  })
  const book = Object.keys(instance.state.getState().books).at(-1) as string
  const perform = (id: string, args: object, on: { book: string } | { page: string } = { book }) =>
    (
      instance.actions as unknown as {
        perform(id: string, a: object, on: { book: string } | { page: string }): { ok: boolean; result?: unknown }
      }
    ).perform(id, args, on)
  const slide = () =>
    pagesOf(instance.state.getState().books[book]!)[0] as { id: string; slide?: Record<string, unknown>[] }
  const page = slide()?.id as string
  return { perform, page, slide: () => slide()?.slide ?? [] }
}

test("置いた物は書いたとおりの位置に残り、押し合わず、紙の外でもよい", () => {
  const s = setup()
  expect(
    s.perform(SLIDE_PLACE.id, { item: TEXT, at: { x: 10, y: 20 }, props: { text: "a" } }, { page: s.page }).ok,
  ).toBe(true)
  // 重なる位置と、紙の外（負の位置）にも置け、先に置いた物は動かない
  expect(
    s.perform(SLIDE_PLACE.id, { item: ELLIPSE, at: { x: 12, y: 22 }, w: 200, h: 100, props: {} }, { page: s.page }).ok,
  ).toBe(true)
  expect(s.perform(SLIDE_PLACE.id, { item: LINE, at: { x: -50, y: -50 }, props: {} }, { page: s.page }).ok).toBe(true)
  expect(s.perform(SLIDE_PLACE.id, { item: RECTANGLE, at: { x: 30, y: 40 }, props: {} }, { page: s.page }).ok).toBe(
    true,
  )
  expect(s.slide().map(i => [i.item, i.x, i.y])).toEqual([
    [TEXT, 10, 20],
    [ELLIPSE, 12, 22],
    [LINE, -50, -50],
    [RECTANGLE, 30, 40],
  ])
  // ブックの物（箱）は置けない
  expect(
    s.perform("@matomezu/paper:item-place", { item: "@matomezu/box:shape-box", at: { x: 0, y: 0 } }, { page: s.page })
      .ok,
  ).toBe(false)
})

test("大きさ: 書いた方だけ変わり、scale なら文字の大きさも幅の倍率で変わる。最小より小さくはできない", () => {
  const s = setup()
  s.perform(SLIDE_PLACE.id, { item: TEXT, w: 200, h: 100, props: { text: "a", fontSize: 20 } }, { page: s.page })
  const id = s.slide()[0]?.id as string
  const prop = (k: string) => (s.slide()[0] as { props: Record<string, unknown> }).props[k]
  const box = () => s.slide()[0] as { w: number; h: number }
  // 幅だけ書けば、高さは今のまま
  expect(s.perform(SLIDE_RESIZE.id, { item: id, w: 300 }, { page: s.page }).ok).toBe(true)
  expect([box().w, box().h]).toEqual([300, 100])
  // 幅と高さを書き、scale なら文字の大きさも幅の倍率で変わる
  expect(s.perform(SLIDE_RESIZE.id, { item: id, w: 600, h: 300, scale: true }, { page: s.page }).ok).toBe(true)
  expect([box().w, box().h]).toEqual([600, 300])
  expect(prop("fontSize")).toBe(40)
  // 最小より小さくはできない
  expect(s.perform(SLIDE_RESIZE.id, { item: id, w: 1, h: 1 }, { page: s.page }).ok).toBe(false)
})

test("項目: 角度を書き、null で消せる。形に合わない項目は断る。動かす・重ねを変える・消す", () => {
  const s = setup()
  s.perform(
    SLIDE_PLACE.id,
    {
      item: FREE,
      props: {
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    },
    { page: s.page },
  )
  s.perform(SLIDE_PLACE.id, { item: ELLIPSE, props: {} }, { page: s.page })
  const [a, b] = s.slide().map(i => i.id as string) as [string, string]
  expect(s.perform(SLIDE_UPDATE.id, { item: a, props: { rotation: 45 } }, { page: s.page }).ok).toBe(true)
  expect((s.slide()[0] as { props: { rotation?: number } }).props.rotation).toBe(45)
  expect(s.perform(SLIDE_UPDATE.id, { item: a, props: { rotation: null } }, { page: s.page }).ok).toBe(true)
  expect((s.slide()[0] as { props: { rotation?: number } }).props.rotation).toBeUndefined()
  expect(s.perform(SLIDE_UPDATE.id, { item: a, props: { points: [{ x: 2, y: 0 }] } }, { page: s.page }).ok).toBe(false)
  expect(s.perform(SLIDE_MOVE.id, { item: a, at: { x: -5, y: 7 } }, { page: s.page }).ok).toBe(true)
  expect(s.perform(SLIDE_REORDER.id, { item: a, to: "front" }, { page: s.page }).ok).toBe(true)
  expect(s.slide().map(i => i.id)).toEqual([b, a])
  expect(s.perform(SLIDE_REMOVE.id, { item: b }, { page: s.page }).ok).toBe(true)
  expect(s.slide().map(i => i.id)).toEqual([a])
})

test("文字枠を置いて続けて打った文字は、置いた画面の履歴の段にまとまり、元に戻すは 1 回で文字枠ごと消える", async () => {
  const store = newStore({
    books: [slideBook()],
  })
  const state = () => pagesOf(store.state.getState().books.b1!)[0]!.slide ?? []
  const put = store.actions.perform(
    SLIDE_PLACE.id,
    { item: TEXT, at: { x: 10, y: 10 }, props: { text: "" } },
    { page: "p1" },
  )
  expect(put.ok).toBe(true)
  await Promise.resolve()
  const id = state()[0]!.id
  store.actions.continueStep("b1")
  store.actions.perform(SLIDE_UPDATE.id, { item: id, props: { text: "書いた" } }, { page: "p1" })
  await Promise.resolve()
  expect(store.state.getState().history.b1?.undo).toHaveLength(1)
  store.actions.command("s1", "@matomezu/base:undo")
  expect(state()).toEqual([])
})

test("続けている画面の履歴の段には、コマンド（slide-set）が行うアクションも足され、元に戻すは 1 回で最初の値に戻る", async () => {
  const store = newStore({
    books: [slideBook()],
  })
  const slide = () =>
    (pagesOf(store.state.getState().books.b1!)[0]!.slide ?? []) as unknown as {
      id: string
      props: { width?: number }
    }[]
  store.actions.perform(
    SLIDE_PLACE.id,
    { item: "@matomezu/slide:slide-ellipse", at: { x: 10, y: 10 }, props: {} },
    { page: "p1" },
  )
  await Promise.resolve()
  const id = slide()[0]!.id
  store.actions.command("s1", SLIDE_SET.id, { items: [id], props: { width: 5 } })
  await Promise.resolve()
  store.actions.continueStep("b1")
  store.actions.command("s1", SLIDE_SET.id, { items: [id], props: { width: 6 } })
  await Promise.resolve()
  expect(slide()[0]?.props.width).toBe(6)
  expect(store.state.getState().history.b1?.undo).toHaveLength(2) // 置いた段と、太さの段（5 と 6 は 1 段）
  store.actions.command("s1", "@matomezu/base:undo")
  expect(slide()[0]?.props.width).toBeUndefined()
})

test("ロック中のページでは、描画シェイプを動かせず消せない（土台が slide のアイテムの id を変化に入れる）", () => {
  const s = setup()
  s.perform(SLIDE_PLACE.id, { item: TEXT, at: { x: 10, y: 20 }, props: { text: "a" } }, { page: s.page })
  const item = s.slide()[0]?.id as string
  expect(s.perform("@matomezu/base:page-lock", {}, { page: s.page }).ok).toBe(true)
  const denied = { ok: false, reason: "denied", permission: "@matomezu/base:lock" }
  expect(s.perform(SLIDE_MOVE.id, { item, at: { x: 0, y: 0 } }, { page: s.page })).toMatchObject(denied)
  expect(s.perform(SLIDE_REMOVE.id, { item }, { page: s.page })).toMatchObject(denied)
  expect(s.slide()).toHaveLength(1)
  expect(s.perform("@matomezu/base:page-unlock", {}, { page: s.page }).ok).toBe(true)
  expect(s.perform(SLIDE_MOVE.id, { item, at: { x: 0, y: 0 } }, { page: s.page }).ok).toBe(true)
})

const SCRAP_BOX = "@matomezu/scrap:shape-scrap-box"
const SCRAP = { page: "p-other", area: { x: 0, y: 0, w: 400, h: 200 }, scale: 0.5 }

test("スクラップボックスも slide に置ける: w・h は受けず書かず（大きさは見る範囲 × 倍率）、大きさを変えると倍率に写して比を保ち、回せない", () => {
  const s = setup()
  const on = { page: s.page }
  expect(s.perform(SLIDE_PLACE.id, { item: SCRAP_BOX, at: { x: 10, y: 20 }, w: 100, props: SCRAP }, on).ok).toBe(false)
  const placed = s.perform(SLIDE_PLACE.id, { item: SCRAP_BOX, at: { x: 10, y: 20 }, props: SCRAP }, on)
  expect(placed.ok).toBe(true)
  const id = (placed.result as { item: string }).item
  const box = () => s.slide().find(x => x.id === id)!
  expect(box()).toEqual({ id, x: 10, y: 20, item: SCRAP_BOX, props: SCRAP })
  expect(s.perform(SLIDE_RESIZE.id, { item: id, w: 400, h: 999 }, on).ok).toBe(true)
  expect(box()).toEqual({ id, x: 10, y: 20, item: SCRAP_BOX, props: { ...SCRAP, scale: 1 } })
  expect(s.perform(SLIDE_UPDATE.id, { item: id, props: { rotation: 30 } }, on).ok).toBe(false)
  // 倍率の下限は、置いた短い辺が 24px（見る範囲の高さ 200 なら 0.12）
  expect(s.perform(SLIDE_UPDATE.id, { item: id, props: { scale: 0.11 } }, on).ok).toBe(false)
  expect(s.perform(SLIDE_UPDATE.id, { item: id, props: { scale: 0.12 } }, on).ok).toBe(true)
})

test("slide に置けるのは、ページのタイプの slide.allowed のアイテムだけ（項目は、そのアイテムの項目の形で確かめる）", () => {
  const s = setup()
  const on = { page: s.page }
  expect(s.perform(SLIDE_PLACE.id, { item: "@matomezu/box:shape-box", props: {} }, on).ok).toBe(false)
  expect(s.perform(SLIDE_PLACE.id, { item: TEXT, props: { text: 1 } }, on).ok).toBe(false)
  expect(s.perform(SLIDE_PLACE.id, { item: LINE }, on).ok).toBe(true) // 項目が無ければ既定
})

test("落としたか貼ったファイルの置く所が紙の上に無ければ（slide-drop の at が NO_PAPER）、スライドの左上から右へ shift の所に置く", () => {
  const store = newStore({ books: [slideBook()] })
  const ran = store.actions.command("s1", SLIDE_DROP.id, {
    page: "p1",
    item: ELLIPSE as never,
    at: NO_PAPER,
    shift: 30,
    props: {},
  })
  expect(ran).toBe(true)
  const slide = (pagesOf(store.state.getState().books.b1!)[0]!.slide ?? []) as unknown as { x: number; y: number }[]
  expect(slide.map(s => ({ x: s.x, y: s.y }))).toEqual([{ x: 30, y: 0 }])
})

import { expect, test } from "bun:test"
import { shapesOf } from "../../web/src/core/placed"
import type { BookOf } from "../../web/src/core/schema/book"
import { resolveTokens } from "../../web/src/core/theme"
import { plainOf } from "../../web/src/plugins/base/text/rich"
import { textWidth } from "../../web/src/plugins/base/text/text"
import { BOX_TOKENS } from "../../web/src/plugins/items/box/box"
import {
  BOX_LOOK,
  BOX_MIN,
  bodyColumn,
  bodyMinWidth,
  bodySides,
  bodyWidthAfter,
  boxLayout,
  placedHeight,
  placedWidth,
  vAlignOf,
} from "../../web/src/plugins/items/box/size"
import { newStore } from "../support"

const page = (store: ReturnType<typeof newStore>) =>
  (store.state.getState().books.b1 as BookOf<"@matomezu/drawing:drawing">).pages[0]!
const items = (store: ReturnType<typeof newStore>) => shapesOf(page(store))
const ALIGNS = { captionAlign: "center", bodyAlign: "left" } as const
const box = (body: string, rule = true) => ({ caption: "見出し", rule, body, ...ALIGNS })
// 本文を n 行出す箱の高さ（上下の枠と余白・キャプション・区切り線・本文）
const heightOf = (n: number, rule = true) =>
  2 * (BOX_LOOK.border + BOX_LOOK.padY) + BOX_LOOK.line + (rule ? 2 * BOX_LOOK.ruleGap + 1 : 0) + n * BOX_LOOK.line
const LONG = "あ".repeat(100)

function ready() {
  const store = newStore()
  store.actions.resizeStage("s1", { w: 1400, h: 1000 })
  return store
}
const place = (
  store: ReturnType<typeof newStore>,
  props: Record<string, unknown>,
  at = { x: 100, y: 100 },
  size: { w?: number; h?: number } = {},
) =>
  store.actions.perform(
    "@matomezu/paper:item-place",
    { page: "p1", item: "@matomezu/box:shape-nest-box", at, props, ...size },
    { book: "b1" },
  )

test("本文は高さに収まる行の数だけ出し、収まらない分は最後の行の終わりに … を付けて切る", () => {
  const all = boxLayout(box(LONG), { w: 160, h: 2000 }).body.map(plainOf)
  expect(all.join("")).toBe(LONG)
  const three = boxLayout(box(LONG), { w: 160, h: heightOf(3) })
  expect(three.body).toHaveLength(3)
  expect(plainOf(three.body[2]!)).toMatch(/…$/)
  expect(boxLayout(box(LONG), { w: 160, h: heightOf(3) + 17 }).body).toHaveLength(3)
  expect(boxLayout(box("一\n二"), { w: 160, h: heightOf(3) }).body.map(plainOf)).toEqual(["一", "二"])
})

test("本文が 1 行も出ない高さなら、区切り線も出さない。一番低い高さはキャプション 1 行ぶん", () => {
  expect(boxLayout(box(LONG), { w: 160, h: heightOf(1) - 1 })).toMatchObject({ body: [], rule: false })
  expect(boxLayout(box(LONG), { w: 160, h: heightOf(1) })).toMatchObject({ rule: true })
  expect(boxLayout(box(LONG, false), { w: 160, h: heightOf(1, false) })).toMatchObject({ rule: false })
  expect(boxLayout(box(LONG, false), { w: 160, h: heightOf(1, false) }).body).toHaveLength(1)
  expect(BOX_MIN.h).toBe(heightOf(0, false))
})

test("置いたときの高さは、本文が 5 行まで見える高さ（一番低くて 64）", () => {
  expect(placedHeight(box(""), 160)).toBe(64)
  expect(placedHeight(box("短い"), 160)).toBe(64)
  expect(placedHeight(box(LONG), 160)).toBe(heightOf(5))
  expect(placedHeight(box("一\n二\n三"), 160)).toBe(heightOf(3))
})

test("置いたときの幅は、キャプションが 20 字まで切れずに見える幅。超えたら 20 字と … の幅で、一番狭くて 64", () => {
  const caption = (c: string) => ({ caption: c, rule: true, body: "", ...ALIGNS })
  const pad = 2 * (BOX_LOOK.border + BOX_LOOK.padX)
  expect(placedWidth(caption(""))).toBe(64)
  expect(placedWidth(caption("見出し"))).toBe(64)
  const twenty = "あ".repeat(20)
  expect(placedWidth(caption(twenty))).toBe(Math.ceil(textWidth(twenty, BOX_LOOK.caption)) + pad)
  const over = placedWidth(caption("あ".repeat(30)))
  expect(over).toBe(Math.ceil(textWidth(`${twenty}…`, BOX_LOOK.caption)) + pad)
  expect(placedWidth(caption("あ".repeat(50)))).toBe(over)
})

test("置くと、幅と高さをデータに書く。幅と高さを渡せばその大きさで置き、一番小さい大きさより小さければ置かない", () => {
  const store = ready()
  expect(place(store, box(LONG)).ok).toBe(true)
  expect(items(store)[0]).toMatchObject({ w: 64, h: heightOf(5) })
  expect(place(store, box(""), { x: 400, y: 100 }, { w: 240, h: 100 }).ok).toBe(true)
  expect(items(store)[1]).toMatchObject({ w: 240, h: 100 })
  expect(place(store, box(""), { x: 100, y: 400 }, { w: 40 }).ok).toBe(false)
  expect(place(store, box(""), { x: 100, y: 400 }, { h: 10 }).ok).toBe(false)
})

test("本文は 2000 字まで", () => {
  const store = ready()
  expect(place(store, box("あ".repeat(2000))).ok).toBe(true)
  expect(place(store, box("あ".repeat(2001)), { x: 400, y: 100 }).ok).toBe(false)
})

test("本文を変えても大きさは変わらない", () => {
  const store = ready()
  place(store, box("短い"))
  store.actions.perform(
    "@matomezu/paper:item-update",
    { page: "p1", item: "n1", props: { body: LONG } },
    { book: "b1" },
  )
  expect(items(store)[0]).toMatchObject({ w: 64, h: 64, props: { body: LONG } })
})

test("@matomezu/paper:item-resize で渡した値だけを変える。x・y を渡せば左上も動く。小さすぎる・紙の外へ出る大きさは断る", () => {
  const store = ready()
  place(store, box("本文"))
  const resize = (args: { w?: number; h?: number; x?: number; y?: number }) =>
    store.actions.perform("@matomezu/paper:item-resize", { page: "p1", item: "n1", ...args }, { book: "b1" })
  expect(resize({ w: 300 }).ok).toBe(true)
  expect(items(store)[0]).toMatchObject({ x: 100, y: 100, w: 300, h: 64 })
  expect(resize({ h: 200, y: 50 }).ok).toBe(true)
  expect(items(store)[0]).toMatchObject({ x: 100, y: 50, w: 300, h: 200 })
  expect(resize({ w: BOX_MIN.w - 1 }).ok).toBe(false)
  expect(resize({ h: BOX_MIN.h - 1 }).ok).toBe(false)
  expect(resize({ h: 2000 }).ok).toBe(false)
  expect(items(store)[0]).toMatchObject({ w: 300, h: 200 })
})

test("画面から辺をつかんで大きさを変える: 辺はその辺だけ、角は 2 つの辺が動き、一番小さい大きさで止まる", () => {
  const store = ready()
  place(store, box("本文"))
  const zoom = store.state.getState().workspace.stages[0]!.zoom
  const drag = (edges: object, x: number, y: number) =>
    store.actions.command("s1", "@matomezu/paper:paper-resize", { item: "n1", edges, by: { x: x * zoom, y: y * zoom } })
  drag({ x: "right" }, 40, 30)
  expect(items(store)[0]).toMatchObject({ x: 100, y: 100, w: 104, h: 64 })
  drag({ y: "bottom" }, 30, 36)
  expect(items(store)[0]).toMatchObject({ w: 104, h: 100 })
  drag({ x: "left", y: "top" }, -20, -10)
  expect(items(store)[0]).toMatchObject({ x: 80, y: 90, w: 124, h: 110 })
  drag({ y: "top" }, 0, 1000)
  expect(items(store)[0]).toMatchObject({ y: 200 - BOX_MIN.h, h: BOX_MIN.h })
})

test("中身を変えてキャプションが長くなったら、20 字まで見える幅まで右へ広げる。狭めはせず、紙の右の端で止める", () => {
  const store = ready()
  place(store, box("本文"))
  const update = (props: Record<string, unknown>) =>
    store.actions.perform("@matomezu/paper:item-update", { page: "p1", item: "n1", props }, { book: "b1" })
  const twenty = "あ".repeat(20)
  expect(update({ caption: twenty }).ok).toBe(true)
  expect(items(store)[0]).toMatchObject({
    x: 100,
    w: placedWidth({ caption: twenty, rule: true, body: "", ...ALIGNS }),
  })
  update({ caption: "あ".repeat(30) })
  const wide = items(store)[0]!.w!
  expect(wide).toBe(placedWidth({ caption: "あ".repeat(30), rule: true, body: "", ...ALIGNS }))
  update({ caption: "短い" })
  expect(items(store)[0]!.w).toBe(wide)
  store.actions.perform("@matomezu/paper:item-resize", { page: "p1", item: "n1", w: 64, x: 1123 - 100 }, { book: "b1" })
  update({ caption: twenty })
  expect(items(store)[0]).toMatchObject({ x: 1023, w: 100 })
})

test("キャプションを変えないなら、幅はそのまま", () => {
  const store = ready()
  place(store, box("本文"), { x: 100, y: 100 }, { w: 64 })
  store.actions.perform("@matomezu/paper:item-resize", { page: "p1", item: "n1", w: 64 }, { book: "b1" })
  store.actions.perform(
    "@matomezu/paper:item-update",
    { page: "p1", item: "n1", props: { body: "変えた" } },
    { book: "b1" },
  )
  expect(items(store)[0]!.w).toBe(64)
})

test("寄せの項目は既定でキャプションが中央、本文が左。左・中央・右のほかは断る", () => {
  const store = ready()
  place(store, { caption: "見出し" })
  expect(items(store)[0]!.props).toMatchObject({ captionAlign: "center", bodyAlign: "left" })
  const update = (props: Record<string, unknown>) =>
    store.actions.perform("@matomezu/paper:item-update", { page: "p1", item: "n1", props }, { book: "b1" })
  expect(update({ captionAlign: "right", bodyAlign: "center" }).ok).toBe(true)
  expect(items(store)[0]!.props).toMatchObject({ captionAlign: "right", bodyAlign: "center" })
  expect(update({ bodyAlign: "justify" }).ok).toBe(false)
})

test("箱にテーマを当てられる。表に無いテーマは断る。テーマの箱のテーマキーは、宣言の値かテーマの上書きで決まる", () => {
  const store = ready()
  expect(place(store, { caption: "付箋", theme: "@matomezu/base:sticky" }).ok).toBe(true)
  expect(items(store)[0]!.props).toMatchObject({ theme: "@matomezu/base:sticky" })
  expect(place(store, { caption: "無い", theme: "nope" }, { x: 400, y: 100 }).ok).toBe(false)
  const update = (props: Record<string, unknown>) =>
    store.actions.perform("@matomezu/paper:item-update", { page: "p1", item: "n1", props }, { book: "b1" })
  expect(update({ theme: "@matomezu/base:simple" }).ok).toBe(true)
  expect(update({ theme: "nope" }).ok).toBe(false)
  expect(update({ theme: null }).ok).toBe(true)
  expect("theme" in items(store)[0]!.props).toBe(false)
  const tokens = (theme: string) => resolveTokens(store.catalog.core, theme, BOX_TOKENS)
  expect(tokens("@matomezu/base:standard")["@matomezu/box:box-radius"]).toEqual({ light: "8px", dark: "8px" })
  expect(tokens("@matomezu/base:standard")["@matomezu/box:box-fold"]).toEqual({ light: "0px", dark: "0px" })
  expect(tokens("@matomezu/base:sticky")["@matomezu/box:box-fill"]).toEqual({ light: "#fff3a6", dark: "#fff3a6" })
  expect(tokens("@matomezu/base:sticky")["@matomezu/box:box-fold"]).toEqual({ light: "12px", dark: "12px" })
  expect(tokens("@matomezu/base:simple")["@matomezu/box:box-line"]).toEqual({ light: "#262626", dark: "#262626" })
})

test("ダイアログの下書きは開いているダイアログが持ち、閉じると消える。データは変えない", () => {
  const store = ready()
  place(store, { caption: "見出し" })
  store.actions.previewDialog({ book: "b1", item: "n1", props: { theme: "@matomezu/base:sticky" } })
  expect(store.state.getState().dialog).toBeNull()
  store.actions.openDialog("s1", "@matomezu/box:box-edit", { page: "p1", item: "n1" })
  store.actions.previewDialog({ book: "b1", item: "n1", props: { theme: "@matomezu/base:sticky" } })
  expect(store.state.getState().dialog?.preview).toEqual({
    book: "b1",
    item: "n1",
    props: { theme: "@matomezu/base:sticky" },
  })
  expect("theme" in items(store)[0]!.props).toBe(false)
  store.actions.closeDialog()
  expect(store.state.getState().dialog).toBeNull()
})

test("縦の位置は書いていなければ自動（本文も子も無ければ真ん中、あれば上）。子がある間は真ん中を上として描く", () => {
  expect(vAlignOf({ body: "" }, false)).toBe("middle")
  expect(vAlignOf({ body: "本文" }, false)).toBe("top")
  expect(vAlignOf({ body: "" }, true)).toBe("top")
  expect(vAlignOf({ body: "本文", vAlign: "bottom" }, false)).toBe("bottom")
  expect(vAlignOf({ body: "", vAlign: "middle" }, true)).toBe("top")
  expect(vAlignOf({ body: "", vAlign: "bottom" }, true)).toBe("bottom")
})

test("本文の幅を書けば、その幅の列で折り返す。列はキャプションの寄せに倣い、キャプションの幅より狭くも、箱の中より広くもならない", () => {
  const inner = 160 - 2 * (BOX_LOOK.border + BOX_LOOK.padX)
  const at = (captionAlign: "left" | "center" | "right", bodyWidth?: number) =>
    bodyColumn({ ...box(LONG), captionAlign, bodyWidth }, 160)
  expect(at("center")).toEqual({ x: 0, w: inner })
  expect(at("left", 80)).toEqual({ x: 0, w: 80 })
  expect(at("center", 80)).toEqual({ x: (inner - 80) / 2, w: 80 })
  expect(at("right", 80)).toEqual({ x: inner - 80, w: 80 })
  expect(at("left", 999).w).toBe(inner)
  expect(at("left", 1).w).toBe(bodyMinWidth(box(LONG)))
  expect(bodyMinWidth({ ...box(LONG), caption: "" })).toBe(BOX_MIN.w - 2 * (BOX_LOOK.border + BOX_LOOK.padX))
  expect(bodyMinWidth({ ...box(LONG), caption: "とても長いキャプションです" })).toBe(
    Math.ceil(textWidth("とても長いキャプションです", BOX_LOOK.caption)),
  )
  const wide = boxLayout(box(LONG), { w: 160, h: heightOf(100) }).body.length
  expect(boxLayout({ ...box(LONG), bodyWidth: 80 }, { w: 160, h: heightOf(100) }).body.length).toBeGreaterThan(wide)
})

test("本文の列の端を動かすと、中央寄せは両側が同じだけ、左寄せは右の端、右寄せは左の端だけが動く。箱の中いっぱいなら幅を消す", () => {
  const inner = 160 - 2 * (BOX_LOOK.border + BOX_LOOK.padX)
  const of = (captionAlign: "left" | "center" | "right") => ({ ...box(LONG), captionAlign })
  expect(bodySides(of("center"))).toEqual(["left", "right"])
  expect(bodySides(of("left"))).toEqual(["right"])
  expect(bodySides(of("right"))).toEqual(["left"])
  expect(bodyWidthAfter(of("center"), 160, "right", -10)).toBe(inner - 20)
  expect(bodyWidthAfter(of("center"), 160, "left", 10)).toBe(inner - 20)
  expect(bodyWidthAfter(of("left"), 160, "right", -10)).toBe(inner - 10)
  expect(bodyWidthAfter(of("right"), 160, "left", 10)).toBe(inner - 10)
  expect(bodyWidthAfter(of("left"), 160, "right", -999)).toBe(bodyMinWidth(of("left")))
  expect(bodyWidthAfter({ ...of("left"), bodyWidth: 80 }, 160, "right", 999)).toBeNull()
})

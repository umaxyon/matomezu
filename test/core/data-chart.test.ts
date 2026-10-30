// データのグラフの計算: 目盛り・軸の合わせ方・項目の並べ方と飛ばし方・棒と折れ線・円・散布図の寸法・ダイアログの軸の下書き・動き
import { expect, test } from "bun:test"
import { AREA_LOOK, areasOf, CONTENT_MIN } from "../../web/src/plugins/items/data/areas"
import { settleAxes } from "../../web/src/plugins/items/data/axes"
import {
  CHART_LOOK,
  cartesianLayout,
  evenShown,
  fitText,
  LABEL_AREA_MAX,
  labelAreaOf,
  labelSizeAfter,
  rowOrder,
} from "../../web/src/plugins/items/data/cartesian"
import { type DataProps, DataPropsSchema } from "../../web/src/plugins/items/data/data"
import { axesProps, axesWithout, toAxesDraft, toggleValue, withView } from "../../web/src/plugins/items/data/draft"
import { chartMotions, cssPx, motionOf, motionState } from "../../web/src/plugins/items/data/motion"
import { MAX_SLICES, pieLayout } from "../../web/src/plugins/items/data/pie"
import { formatNumber, niceTicks } from "../../web/src/plugins/items/data/scale"
import { scatterLayout } from "../../web/src/plugins/items/data/scatter"
import { fitTable } from "../../web/src/plugins/items/data/size"
import type { Table } from "../../web/src/plugins/items/data/table"
import { cartesianTip, pieTip, scatterTip, seriesNames } from "../../web/src/plugins/items/data/tips"

const props = (p: Record<string, unknown>): DataProps => DataPropsSchema.parse(p)

// 月（文字）・売上・目標（数）の表
const TABLE: Table = {
  columns: [
    { id: "m", name: "月", type: "text" },
    { id: "s", name: "売上", type: "number" },
    { id: "g", name: "目標", type: "number" },
  ],
  rows: [
    { id: "r1", cells: ["1月", 12, 15] },
    { id: "r2", cells: ["2月", 30, 20] },
    { id: "r3", cells: ["3月", 22, 25] },
  ],
}
const SIZE = { w: 320, h: 200 }

test("目盛りは 1・2・5 の刻みで値を含み、棒なら 0 も含める。数は 3 桁ごとに , で区切る", () => {
  expect(niceTicks(12, 41, true)).toMatchObject({ min: 0, max: 50, step: 10, values: [0, 10, 20, 30, 40, 50] })
  expect(niceTicks(103, 117, false, 4)).toMatchObject({ min: 100, max: 120, step: 5 })
  expect(niceTicks(0.1, 0.3, false, 2)).toMatchObject({ max: 0.3, values: [0.1, 0.2, 0.3] })
  expect(niceTicks(7, 7, false).values.length).toBeGreaterThan(1)
  expect(formatNumber(1234567.5)).toBe("1,234,567.5")
  expect(formatNumber(-1200)).toBe("-1,200")
})

test("軸は、表に無い列・数でない値の列を外し、グラフで軸が無ければ既定の列を選ぶ（散布図は数の列 2 つ）", () => {
  expect(settleAxes(props({ view: "bar" }), TABLE)).toMatchObject({ x: "m", series: [{ column: "s" }] })
  expect(settleAxes(props({ view: "scatter" }), TABLE)).toMatchObject({ x: "s", series: [{ column: "g" }] })
  expect(settleAxes(props({ view: "table" }), TABLE).x).toBeUndefined()
  const kept = settleAxes(
    props({ view: "bar", x: "gone", series: [{ column: "m" }, { column: "g" }, { column: "g" }], sortBy: "s" }),
    TABLE,
  )
  expect(kept.x).toBeUndefined()
  expect(kept.series).toEqual([{ column: "g" }])
  expect(kept.sortBy).toBeUndefined()
  // 散布図の X が文字の列なら外す
  expect(settleAxes(props({ view: "scatter", x: "m", series: [{ column: "s" }] }), TABLE).x).toBeUndefined()
})

test("並べ方: 表の順か、選んだ値（無ければ 1 つ目の系列）の多い順・少ない順。同じ値は表の順", () => {
  const base = { view: "bar", x: "m", series: [{ column: "s" }, { column: "g" }] }
  expect(rowOrder(TABLE, props(base))).toEqual([0, 1, 2])
  expect(rowOrder(TABLE, props({ ...base, sort: "desc" }))).toEqual([1, 2, 0])
  expect(rowOrder(TABLE, props({ ...base, sort: "asc", sortBy: "g" }))).toEqual([0, 1, 2])
  expect(rowOrder(TABLE, props({ ...base, sort: "desc", sortBy: "g" }))).toEqual([2, 1, 0])
})

test("項目の文字を飛ばすときは最初と最後を必ず出し、最後に近すぎる手前の項目は出さない。入らない文字は … で切る", () => {
  expect(evenShown(5, 1)).toEqual([true, true, true, true, true])
  expect(evenShown(7, 3)).toEqual([true, false, false, true, false, false, true])
  expect(evenShown(6, 3)).toEqual([true, false, false, false, false, true])
  expect(fitText("とても長い項目の名前", 40)).toMatch(/…$/)
  expect(fitText("短い", 200)).toBe("短い")
})

test("棒: 系列ごとに 0 から伸び、項目の中で 2px 空けて並び、太さは 24px まで。系列が 2 つなら凡例を出す", () => {
  const c = cartesianLayout(TABLE, props({ view: "bar", x: "m", series: [{ column: "s" }, { column: "g" }] }), SIZE)!
  expect(c.bars).toHaveLength(6)
  expect(c.legend.map(l => l.name)).toEqual(["売上", "目標"])
  const [a, b] = c.bars
  expect(b!.x - (a!.x + a!.w)).toBeCloseTo(CHART_LOOK.gap)
  expect(Math.max(...c.bars.map(x => x.w))).toBeLessThanOrEqual(CHART_LOOK.barMax)
  for (const bar of c.bars) expect(bar.y + bar.h).toBeCloseTo(c.zero)
  // 折れ線の系列を重ねると、その系列は点を結ぶ
  const mixed = cartesianLayout(
    TABLE,
    props({ view: "bar", x: "m", series: [{ column: "s" }, { column: "g", chart: "line" }] }),
    SIZE,
  )!
  expect(mixed.bars).toHaveLength(3)
  expect(mixed.lines[0]!.points).toHaveLength(3)
  // 系列が 1 つなら凡例は無い。軸が無ければ描かない
  expect(cartesianLayout(TABLE, props({ view: "line", x: "m", series: [{ column: "s" }] }), SIZE)!.legend).toEqual([])
  expect(cartesianLayout(TABLE, props({ view: "bar" }), SIZE)).toBeNull()
})

test("横向きの棒は左から右へ伸び、折れ線を重ねない", () => {
  const c = cartesianLayout(
    TABLE,
    props({ view: "bar", bar: "horizontal", x: "m", series: [{ column: "s" }, { column: "g", chart: "line" }] }),
    SIZE,
  )!
  expect(c.horizontal).toBe(true)
  expect(c.lines).toEqual([])
  expect(c.bars).toHaveLength(6)
  for (const bar of c.bars) expect(bar.x).toBeCloseTo(c.zero)
})

test("円: 負の値や合計 0 は描かない。9 つ以上の扇は大きい 7 つとその他にまとめる", () => {
  const pie = pieLayout(TABLE, props({ view: "pie", x: "m", series: [{ column: "s" }] }), SIZE, "その他")!
  expect(pie.ok).toBe(true)
  if (pie.ok) expect(pie.slices.map(s => s.share).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  const neg = { ...TABLE, rows: [...TABLE.rows, { id: "r4", cells: ["4月", -1, 0] }] }
  expect(pieLayout(neg, props({ view: "pie", x: "m", series: [{ column: "s" }] }), SIZE, "")).toEqual({
    ok: false,
    problem: "negative",
  })
  const zero = { ...TABLE, rows: TABLE.rows.map(r => ({ ...r, cells: [r.cells[0]!, 0, 0] })) }
  expect(pieLayout(zero, props({ view: "pie", x: "m", series: [{ column: "s" }] }), SIZE, "")).toEqual({
    ok: false,
    problem: "zero",
  })
  const many = { ...TABLE, rows: Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, cells: [`${i}`, i + 1, 0] })) }
  const folded = pieLayout(many, props({ view: "pie", x: "m", series: [{ column: "s" }] }), SIZE, "その他")!
  expect(folded.ok && folded.slices.length).toBe(MAX_SLICES)
  if (folded.ok) expect(folded.slices.at(-1)).toMatchObject({ label: "その他", value: 1 + 2 + 3 + 4 + 5 })
})

test("散布図: 行ごとに点を打ち、X が数の列でなければ描かない", () => {
  const sc = scatterLayout(TABLE, props({ view: "scatter", x: "s", series: [{ column: "g" }], label: "m" }), SIZE)!
  expect(sc.dots.map(d => d.label)).toEqual(["1月", "2月", "3月"])
  expect(sc.dots[1]!.x).toBeGreaterThan(sc.dots[0]!.x)
  expect(scatterLayout(TABLE, props({ view: "scatter", x: "m", series: [{ column: "g" }] }), SIZE)).toBeNull()
})

test("ダイアログの軸の下書き: 見た目を変えると合わない軸を選び直し、列を消すと軸を詰め、確定で列の id に直す", () => {
  const draft = { columns: TABLE.columns, rows: [] }
  let a = toAxesDraft(props({ view: "table" }), TABLE)
  a = withView(a, draft, "pie")
  expect(a).toMatchObject({ x: 0, values: [1] })
  // 円から散布図へは、X を数の列にする
  a = withView(a, draft, "scatter")
  expect(a).toMatchObject({ x: 2, values: [1] })
  a = withView(a, draft, "bar")
  a = toggleValue(a, 2)
  expect(a.values).toEqual([1, 2])
  expect(axesWithout(a, 1)).toMatchObject({ x: 1, values: [1] })
  expect(axesProps({ ...a, sortBy: 2 }, ["m", "s", "g"], [])).toMatchObject({
    view: "bar",
    x: "g",
    series: [{ column: "s" }, { column: "g" }],
    sortBy: "g",
    label: null,
  })
  // 円と散布図の値は 1 つ目だけ
  expect(axesProps({ ...a, view: "pie" }, ["m", "s", "g"], []).series).toEqual([{ column: "s" }])
})

test("吹き出し: 棒と折れ線は項目の名前と全部の系列の値、円は割合と値、散布図は X と Y", () => {
  const p = props({ view: "bar", x: "m", series: [{ column: "s" }, { column: "g", chart: "line" }] })
  const c = cartesianLayout(TABLE, p, SIZE)!
  expect(cartesianTip(c, "r2", seriesNames(TABLE, p))).toEqual({
    title: "2月",
    lines: [
      { color: 0, name: "売上", value: "30" },
      { color: 1, name: "目標", value: "20" },
    ],
  })
  const pie = pieLayout(TABLE, props({ view: "pie", x: "m", series: [{ column: "s" }] }), SIZE, "")!
  if (pie.ok)
    expect(pieTip(pie.slices[1]!)).toEqual({ title: "2月", lines: [{ color: 1, name: "46.9%", value: "30" }] })
  const sc = scatterLayout(TABLE, props({ view: "scatter", x: "s", series: [{ column: "g" }], label: "m" }), SIZE)!
  expect(scatterTip(sc, sc.dots[0]!)).toEqual({
    title: "1月",
    lines: [
      { name: "売上", value: "12" },
      { name: "目標", value: "15" },
    ],
  })
})

// 長い名前の行がたくさんある表（値は行の番号。7 行目だけ大きい）
const MANY: Table = {
  columns: TABLE.columns,
  rows: Array.from({ length: 30 }, (_, i) => ({
    id: `w${i}`,
    cells: [`とても長い項目の名前 ${i}`, i === 7 ? 999 : i, 0],
  })),
}
const shownRows = (p: Record<string, unknown>) =>
  cartesianLayout(MANY, props({ view: "bar", x: "m", series: [{ column: "s" }], ...p }), SIZE)!
    .categories.filter(c => c.shown)
    .map(c => c.row)

test("項目の文字の出し方: 等間隔は最初と最後、多い順は大きい値の行から、選んだ行だけは印の行。隣の文字までに入らなければ … で切る", () => {
  const even = shownRows({})
  expect(even[0]).toBe("w0")
  expect(even.at(-1)).toBe("w29")
  expect(even.length).toBeLessThan(30)
  const top = shownRows({ skip: "top" })
  expect(top).toContain("w7")
  expect(top).toContain("w29")
  expect(shownRows({ skip: "picked", picked: ["w3", "w20"] })).toEqual(["w3", "w20"])
  // 飛ばして出す文字は切らずに入る。5 行離れた 2 行を選ぶと、隣までに入らないので切る
  const c = cartesianLayout(MANY, props({ view: "bar", x: "m", series: [{ column: "s" }] }), SIZE)!
  expect(c.categories.find(k => k.row === "w0")!.text).toBe("とても長い項目の名前 0")
  const close = cartesianLayout(
    MANY,
    props({ view: "bar", x: "m", series: [{ column: "s" }], skip: "picked", picked: ["w3", "w8"] }),
    SIZE,
  )!
  for (const k of close.categories.filter(x => x.shown)) expect(k.text).toMatch(/…$/)
})

test("傾けると、文字の領域が文字の斜めの高さ（高さの 4 割まで）になり、飛ばす間隔が狭まる。横の棒は傾けない", () => {
  const flat = cartesianLayout(MANY, props({ view: "bar", x: "m", series: [{ column: "s" }] }), SIZE)!
  const tilted = cartesianLayout(
    MANY,
    props({ view: "bar", x: "m", series: [{ column: "s" }], crowd: "rotate" }),
    SIZE,
  )!
  expect(tilted.rotate).toBe(true)
  expect(flat.labelArea.h).toBe(CHART_LOOK.line)
  expect(tilted.labelArea.h).toBe(Math.floor((SIZE.h - 2 * CHART_LOOK.pad) * 0.4))
  expect(tilted.categories.filter(k => k.shown).length).toBeGreaterThan(flat.categories.filter(k => k.shown).length)
  const side = cartesianLayout(
    MANY,
    props({ view: "bar", bar: "horizontal", x: "m", series: [{ column: "s" }], crowd: "rotate" }),
    SIZE,
  )!
  expect(side.rotate).toBe(false)
})

test("文字の領域は labelSize の大きさで、1 行から枠の 6 割まで。つまみで動かした量だけ変わる", () => {
  const p = (labelSize: number) =>
    cartesianLayout(MANY, props({ view: "bar", x: "m", series: [{ column: "s" }], labelSize }), SIZE)!
  expect(p(40).labelArea.h).toBe(40)
  expect(p(1).labelArea.h).toBe(CHART_LOOK.line)
  expect(p(9999).labelArea.h).toBe(Math.round((SIZE.h - 2 * CHART_LOOK.pad) * LABEL_AREA_MAX))
  expect(labelAreaOf(p(40))).toBe(40)
  expect(labelSizeAfter(40, false, SIZE, 10)).toBe(50)
  expect(labelSizeAfter(40, false, SIZE, -100)).toBe(CHART_LOOK.line)
  // 文字の領域が広いほど、描く所は低くなる
  expect(p(60).plot.h).toBeLessThan(p(20).plot.h)
})

test("軸を表に合わせると、表に無い選んだ行は外れる", () => {
  expect(
    settleAxes(props({ view: "bar", x: "m", series: [{ column: "s" }], picked: ["r1", "gone"] }), TABLE).picked,
  ).toEqual(["r1"])
})

test("文字の領域: キャプションか本文があれば上か下に出し、出さない・どちらも無いなら出さない。描く所は 40px より低くしない", () => {
  const size = { w: 200, h: 120 }
  const none = areasOf(props({}), size)
  expect(none.text).toBeNull()
  expect(none.content).toEqual({ w: 198, h: 118 })
  const top = areasOf(props({ caption: "売上" }), size)
  expect(top.text!.height).toBe(18 + 2 * AREA_LOOK.padY)
  expect(top.content.h).toBe(118 - top.text!.height)
  expect(top.contentTop).toBe(false)
  expect(areasOf(props({ caption: "売上", textAt: "bottom" }), size).contentTop).toBe(true)
  expect(areasOf(props({ caption: "売上", textAt: "none" }), size).text).toBeNull()
  const long = areasOf(props({ caption: "売上", body: "とても長い本文。".repeat(40) }), size)
  expect(long.content.h).toBeGreaterThanOrEqual(CONTENT_MIN)
})

test("表の見た目の大きさは、表と、本文を全部出した文字の領域が見える大きさ。幅はキャプションが見える幅より狭くしない", () => {
  const plain = fitTable(TABLE, props({}), { w: 2000, h: 2000 })
  const titled = fitTable(TABLE, props({ caption: "とても長い表のキャプションです", body: "説明" }), {
    w: 2000,
    h: 2000,
  })
  expect(titled.h).toBeGreaterThan(plain.h)
  expect(titled.w).toBeGreaterThanOrEqual(plain.w)
})

test("動きのきっかけ: 初めて描いたとき・表を入れ替えたとき・見た目や軸を変えたとき。大きさや文字の領域を変えても動かない", () => {
  const bar = props({ view: "bar", x: "m", series: [{ column: "s" }] })
  const first = motionState(TABLE, bar)
  expect(motionOf(undefined, first)).toBe("draw")
  expect(motionOf(undefined, motionState(undefined, bar))).toBeNull() // 表の無い間は動かない
  expect(motionOf(null, first)).toBe("data") // 表が入った
  expect(motionOf(first, motionState({ ...TABLE, rows: TABLE.rows.slice(1) }, bar))).toBe("data")
  expect(motionOf(first, motionState(TABLE, { ...bar, view: "line" }))).toBe("look")
  expect(motionOf(first, motionState(TABLE, { ...bar, sort: "desc" }))).toBe("look")
  expect(motionOf(first, motionState(TABLE, { ...bar, labelSize: 40, caption: "売上", bodyWidth: 80 }))).toBeNull()
})

test("動き方はテーマキーの言葉から選び、知らない言葉なら動かさない。長さの値は px の数にする", () => {
  const tokens: Record<string, string> = {
    "data-motion-bar": " fade",
    "data-motion-line": "sweep", // 折れ線には無い動き
    "data-motion-dot": "pop",
  }
  expect(chartMotions(name => tokens[name] ?? "")).toEqual({ bar: "fade", line: "none", dot: "pop", pie: "none" })
  expect(cssPx(" 6px", 4)).toBe(6)
  expect(cssPx("", 4)).toBe(4)
})

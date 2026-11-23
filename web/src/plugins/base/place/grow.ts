// ページの紙の大きさと可変ページの広さ: 紙の大きさで区切った印刷区画を、中身が入るだけ並べる（pageArea）。区切りの線の位置、増やす向き（growOf）、
// 中身の外枠（extentOf）、中身を印刷区画の単位でずらす（alignPadding・paddedFor）も出す
import { type CoreCatalog, pageType } from "../../../core/core-catalog"
import type { ConnectorData } from "../../../core/def/item"
import type { GrowChoice } from "../../../core/def/paper"
import type { Point, Rect, Size } from "../../../core/geom"
import { resolvePaper } from "../../../core/paper"
import {
  byConnector,
  connectorDef,
  connectorsOf,
  type ItemPage,
  isShape,
  type PlacedConnector,
  pageItemsOf,
} from "../../../core/placed"
import type { Page } from "../../../core/schema/book"
import { type SettingReader, settingsAt } from "../book-settings"
import { setField } from "../utils/fields"
import { portAreasOf, rectsOf } from "./placed"

// 可変ページの増やす向き: 上・下・左・右のうち、どれへ印刷区画を増やすか
export interface GrowSides {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

// 利用者が選んだ増やす向き（ページの grows）の上・下・左・右
export const GROW_CHOICE_SIDES = {
  "right-down": { up: false, down: true, left: false, right: true },
  right: { up: false, down: false, left: false, right: true },
  down: { up: false, down: true, left: false, right: false },
  all: { up: true, down: true, left: true, right: true },
} as const satisfies Record<GrowChoice, GrowSides>

// 可変ページの増やす向きの決め方: 利用者が choices から選ぶ（最初のものが既定。ページの grows に選んだものを持つ）か、
// タイプがページで効いている設定の値 setting から決める（ページの grows は true）か、どのページもいつも可変ページで、いつも always へ増やす
// （ページの grows には持たず、可変ページにする・やめるは選べない）
export type GrowRule =
  | { choices: readonly GrowChoice[] }
  | { sides(setting: SettingReader): GrowSides }
  | { always: GrowSides }

// 決め方 rule の種類: 利用者が選べる増やす向きの一覧（最初のものが既定）、タイプが向きを決める by-type、どのページもいつも可変ページの always、
// 可変ページを作れない none（rule が無い）
export const growKindOf = ({
  grow: rule,
}: {
  grow?: GrowRule
}): readonly GrowChoice[] | "by-type" | "always" | "none" =>
  !rule ? "none" : "always" in rule ? "always" : "choices" in rule ? rule.choices : "by-type"

// 可変ページの増やす向きの決め方（定義オブジェクトの拡張ポイントに書き足す。無ければ可変ページを作れない。ページを持つタイプだけが使う）
declare module "../../../core/catalog" {
  interface PageTypeExtras {
    grow?: GrowRule
  }
}

// ページに何も描かない（外枠が無い）
export const NO_EXTENT = "none"

// 紙の大きさ paper で区切った印刷区画を、中身の外枠 extent（紙の座標。無ければ中身が無い）が入るだけ、増やす向き sides に並べた数と、その広さ。
// 増やさない向きは 1 つ。spare なら、右・下へ増やす向きに空きの印刷区画を 1 つずつ足す（ステージで、そこへ置けば増える）
export function grownArea(
  paper: Size,
  sides: GrowSides,
  extent: Rect | typeof NO_EXTENT,
  spare = false,
): { columns: number; rows: number; size: Size } {
  // 端がちょうど印刷区画の境目なら、次の印刷区画は要らない（割り算の誤差で 1 つ増やさない）。左（上）へ増やすページは、
  // 左（上）の空きの印刷区画をデータに持つ（alignPadding）ので、少なくとも 2 つ
  const count = (end: number, len: number, before: boolean, after: boolean) =>
    before || after ? Math.max(before ? 2 : 1, Math.ceil(end / len - 1e-9)) + (spare && after ? 1 : 0) : 1
  const columns = count(extent !== NO_EXTENT ? extent.x + extent.w : 0, paper.w, sides.left, sides.right)
  const rows = count(extent !== NO_EXTENT ? extent.y + extent.h : 0, paper.h, sides.up, sides.down)
  return { columns, rows, size: { w: columns * paper.w, h: rows * paper.h } }
}

// 広さ area を紙の大きさ paper で区切った印刷区画の数と、境目の線の位置（縦の線の x と、横の線の y）。紙 1 枚に収まる広さなら null
export function printAreaLines(
  paper: Size,
  area: Size,
): { columns: number; rows: number; xs: number[]; ys: number[] } | null {
  if (area.w <= paper.w && area.h <= paper.h) return null
  const columns = Math.round(area.w / paper.w)
  const rows = Math.round(area.h / paper.h)
  return {
    columns,
    rows,
    xs: Array.from({ length: columns - 1 }, (_, i) => (i + 1) * paper.w),
    ys: Array.from({ length: rows - 1 }, (_, i) => (i + 1) * paper.h),
  }
}

// タイプ type のページを、可変ページにする・やめるを選べるか（いつも可変ページのタイプは選べない）
export function canGrow(catalog: CoreCatalog, type: string): boolean {
  const kind = growKindOf(pageType(catalog, type))
  return kind !== "none" && kind !== "always"
}

// タイプ type で利用者が選べる増やす向き（最初のものが既定）。タイプが決めるなら空
export function growChoices(catalog: CoreCatalog, type: string): readonly GrowChoice[] {
  const kind = growKindOf(pageType(catalog, type))
  return typeof kind === "string" ? [] : kind
}

// 可変ページにするか（true・false）か、選んだ増やす向き grows を、タイプ type のページの grows の値にしたもの。作れない・選べない向きなら null。
// 向きを選べるタイプで true なら既定の向き。false なら undefined（可変ページでない）
export function growsValue(catalog: CoreCatalog, type: string, grows: boolean | GrowChoice): Page["grows"] | null {
  if (grows === false) return undefined
  if (!canGrow(catalog, type)) return null
  const choices = growChoices(catalog, type)
  if (grows === true) return choices[0] ?? true
  return choices.includes(grows) ? grows : null
}

// ページ page の grows を grows（ページの grows の値）にしたもの（中身は、ノーマライズステップ pages/variable-pages.ts が増やす向きに合わせてずらす）
export const withGrows = <P extends Page>(page: P, grows: Page["grows"]): P =>
  setField(page, ["orientation"], "grows", grows)

// ページの紙の大きさ
export const paperSize = (catalog: CoreCatalog, page: ItemPage): Size => resolvePaper(catalog, page).size

// 増やす向きが無い（可変ページでない）ときの値
export const NO_GROW = "none"

// ページ page の増やす向き（可変ページでなければ NO_GROW）。利用者が選ぶタイプは選んだ向き（選べない向きや true なら既定）、
// タイプが決めるタイプは、そのページで効いている設定の値から。いつも可変ページのタイプは、どのページもタイプの向き
export function growOf(catalog: CoreCatalog, page: ItemPage): GrowSides | typeof NO_GROW {
  const rule = catalog.pageTypes.get(page.type)?.grow
  if (rule && "always" in rule) return rule.always
  if (!page.grows || !rule) return NO_GROW
  if ("sides" in rule) return rule.sides(settingsAt(catalog, page))
  const chosen = page.grows === true || !rule.choices.includes(page.grows) ? rule.choices[0] : page.grows
  return chosen ? GROW_CHOICE_SIDES[chosen] : NO_GROW
}

declare module "../../../core/catalog" {
  interface PageTypeExtras {
    // 位置をデータに持たないプレゼンテーションが、可変ページで描く中身を右・下へずらした印刷区画の数（ページの slide の形も、同じだけずらして描く。無ければ 0）。
    // page で効いている設定の値は setting、ページの増やす向きは grow（可変ページでなければ NO_GROW。growOf）
    contentOrigin?(
      catalog: CoreCatalog,
      page: ItemPage,
      setting: SettingReader,
      grow: GrowSides | typeof NO_GROW,
    ): Point
  }
}

// ページ page の slide の形を、描くときにずらす量（紙の上。ページのタイプの contentOrigin の印刷区画の数に、紙の大きさを掛ける）。
// 位置をデータに持つプレゼンテーションは、データの slide の座標をずらすので、ここでは 0
export function slideOffsetOf(catalog: CoreCatalog, page: ItemPage): Point {
  const paper = paperSize(catalog, page)
  const origin = pageType(catalog, page.type).contentOrigin?.(
    catalog,
    page,
    settingsAt(catalog, page),
    growOf(catalog, page),
  )
  return origin ? { x: origin.x * paper.w, y: origin.y * paper.h } : { x: 0, y: 0 }
}

// ページ page の広さ: 可変ページでなければ紙 1 枚。可変ページは、形とつなぐものの外枠が入るだけ印刷区画を並べた広さ
// （spare なら右・下へ増やす向きに空きの印刷区画を 1 つずつ足す。grow.ts の grownArea）
export function pageArea(
  catalog: CoreCatalog,
  page: ItemPage,
  spare = false,
): { columns: number; rows: number; size: Size } {
  const paper = paperSize(catalog, page)
  const grow = growOf(catalog, page)
  if (grow === NO_GROW) return { columns: 1, rows: 1, size: paper }
  const extent = extentOf(catalog, page, settingsAt(catalog, page))
  return grownArea(paper, grow, extent, spare)
}

// ページの形を置ける広さ（ページの Frame の大きさ）: 可変ページでなければ紙 1 枚。可変ページは、形の外枠が入るだけ並べた印刷区画に、
// 右・下へ増やす向きの空きを 1 つずつ足した広さ（空きへ置けば、また空きが出る）。つなぐものは測らない（道筋を計算し直さないため）
export function roomOf(catalog: CoreCatalog, page: ItemPage): Size {
  const paper = paperSize(catalog, page)
  const grow = growOf(catalog, page)
  if (grow === NO_GROW) return paper
  const rects = [...rectsOf(catalog, page).values()]
  const extent: Rect | typeof NO_EXTENT = rects.length
    ? {
        x: 0,
        y: 0,
        w: Math.max(...rects.map(r => r.x + r.w)),
        h: Math.max(...rects.map(r => r.y + r.h)),
      }
    : NO_EXTENT
  return grownArea(paper, grow, extent, true).size
}

// ページの形とつなぐものを、今の位置で描いたときの外枠（つなぐものは定義の bounds で測る）。何も描かなければ NO_EXTENT。
// setting はそのページで効いている設定の値
export function extentOf(catalog: CoreCatalog, page: ItemPage, setting: SettingReader): Rect | typeof NO_EXTENT {
  const rects = rectsOf(catalog, page)
  const boxes: Rect[] = [...rects.values()]
  const areas = portAreasOf(catalog, page, rects)
  for (const [def, list] of byConnector(catalog, page)) {
    const b = def.bounds?.(list as ConnectorData[], areas, setting)
    if (b) boxes.push(b)
  }
  if (boxes.length === 0) return NO_EXTENT
  const x = Math.min(...boxes.map(b => b.x))
  const y = Math.min(...boxes.map(b => b.y))
  return { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y }
}

// 可変ページの中身を、印刷区画の単位でずらしたページ: 形の外枠の左端（上端）が、左（上）から into.x（into.y）番目の印刷区画に来るようにする
// （1 なら左・上に空きの印刷区画を 1 つ持ち、0 なら持たない。無い向きはずらさない）。ずらした量（印刷区画の数）はページの shift に足す（0 なら消す）。
// つなぐものは、定義の shift で位置を持つ物も一緒にずらす。ページの slide の形も、同じ量でずらす（線の点は枠の割合なので、枠の位置だけ）。
// 形の無いページ・ずらさなくてよいページはそのまま
export function alignPadding<P extends ItemPage>(catalog: CoreCatalog, page: P, into: { x?: 0 | 1; y?: 0 | 1 }): P {
  const paper = paperSize(catalog, page)
  const rects = [...rectsOf(catalog, page).values()]
  if (rects.length === 0) return page
  const kx = into.x === undefined ? 0 : into.x - Math.floor(Math.min(...rects.map(r => r.x)) / paper.w)
  const ky = into.y === undefined ? 0 : into.y - Math.floor(Math.min(...rects.map(r => r.y)) / paper.h)
  if (kx === 0 && ky === 0) return page
  const d = { x: kx * paper.w, y: ky * paper.h }
  const shifted = shiftedConnectors(catalog, page, () => d)
  const items = pageItemsOf(page).map(i =>
    isShape(i) ? { ...i, x: i.x + d.x, y: i.y + d.y } : (shifted.get(i.id) ?? i),
  )
  const total = { x: (page.shift?.x ?? 0) + kx, y: (page.shift?.y ?? 0) + ky }
  const moved = {
    ...page,
    items,
    ...(page.slide ? { slide: page.slide.map(s => ({ ...s, x: s.x + d.x, y: s.y + d.y })) } : {}),
  }
  return setField(moved, ["orientation", "grows"], "shift", total.x === 0 && total.y === 0 ? undefined : total)
}

// ページ page のつなぐもののうち、by が量を返すものを、定義の shift で位置を持つ物ごとその量だけずらした物（id → ずらした物）。
// 定義に shift の無い種類と、by が null を返すものは入れない
export function shiftedConnectors(
  catalog: CoreCatalog,
  page: ItemPage,
  by: (c: PlacedConnector) => Point | null,
): Map<string, PlacedConnector> {
  const groups = new Map<string, { d: Point; list: PlacedConnector[] }>() // 種類と量 → つなぐもの
  for (const c of connectorsOf(page)) {
    const d = by(c)
    if (!d) continue
    const key = `${c.item} ${d.x},${d.y}`
    groups.set(key, { d, list: [...(groups.get(key)?.list ?? []), c] })
  }
  const shifted = new Map<string, PlacedConnector>()
  if (groups.size === 0) return shifted
  const areas = portAreasOf(catalog, page)
  for (const { d, list } of groups.values()) {
    const def = connectorDef(catalog, (list[0] as PlacedConnector).item)
    if (!def?.shift) continue
    for (const c of def.shift(list as ConnectorData[], areas, d)) shifted.set(c.id, c as PlacedConnector)
  }
  return shifted
}

// 可変ページの中身を、増やす向き sides に合わせてずらしたページ: 左（上）へ増やすなら左（上）に空きの印刷区画を 1 つ持たせ、
// 前は増やしていた（was）が増やさなくなった向きは空きを詰める（入らないかは shapesFit で確かめる）
export function paddedFor<P extends ItemPage>(
  catalog: CoreCatalog,
  page: P,
  sides: GrowSides | typeof NO_GROW,
  was: GrowSides | typeof NO_GROW,
): P {
  const axis = (now: boolean, before: boolean) => (now ? 1 : before ? 0 : undefined)
  const on = (s: GrowSides | typeof NO_GROW, side: "left" | "up") => s !== NO_GROW && s[side]
  return alignPadding(catalog, page, {
    x: axis(on(sides, "left"), on(was, "left")),
    y: axis(on(sides, "up"), on(was, "up")),
  })
}

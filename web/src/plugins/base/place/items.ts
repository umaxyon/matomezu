// ページに置いたアイテムの操作（データを書き換えず、新しい値を返す）。
// アイテムは紙から少しでもはみ出す所には置かず、動かさない。置いた・動かした・大きさか左上が変わったアイテムは、近づきすぎた相手をどける（push.ts）。
// 形が変わったあとは、ページのつなぐものの決まりで整える（placed.ts の tidyConnectors）
import { type PagedBook, putPage } from "../../../core/book"
import type { CatalogCheck, CoreCatalog } from "../../../core/core-catalog"
import type { ConnectorData, ShapeData } from "../../../core/def/item"
import { problem } from "../../../core/errors"
import type { Point, Size } from "../../../core/geom"
import { resolvePaper } from "../../../core/paper"
import {
  byConnector,
  connectorDef,
  connectorsOf,
  findShape,
  type ItemPage,
  isShape,
  type PlacedConnector,
  type PlacedItem,
  type PlacedShape,
  pageItemsOf,
  replaceShape,
  shapesOf,
  walkShapes,
} from "../../../core/placed"
import type { Book } from "../../../core/schema/book"
import { type PageContext, type SettingReader, settingsAt } from "../book-settings"
import { setField } from "../fields"
import { contentIdMaker } from "../utils/ids"
import { GROW_CHOICE_SIDES, type GrowSides, grownArea } from "./grow"
import {
  childrenSize,
  connectorGaps,
  type PortArea,
  placedSize,
  portAreasOf,
  rectsOf,
  shapeDefOf,
  tidyConnectors as tidyItems,
} from "./placed"
import {
  apartWay,
  evenGap,
  type Floors,
  type Gap,
  inPaper,
  newClash,
  planPlace,
  pushFrom,
  type Rect,
  tooClose,
} from "./push"

// 形の仲間の名前（familyTitle）が文言の表にあるか（組み立てのときの確かめ）
export const FAMILY_TITLE_CHECK: CatalogCheck = catalog =>
  [...catalog.items.values()].flatMap(i => {
    const title = i.kind === "shape" ? i.familyTitle : undefined
    return title !== undefined && !catalog.messages.has(title)
      ? [problem("E018", { kind: "item", id: i.id, title })]
      : []
  })

// 形の captionProp・themeProp が、その形の props にある項目を名指しているか（組み立てのときの確かめ）
export const PROP_NAMES_CHECK: CatalogCheck = catalog =>
  [...catalog.items.values()].flatMap(i =>
    i.kind !== "shape"
      ? []
      : (["themeProp", "captionProp"] as const).flatMap(field => {
          const prop = i[field]
          const shape = (i.props as { shape?: Record<string, unknown> }).shape
          return prop !== undefined && !(shape && prop in shape) ? [problem("E028", { id: i.id, field, prop })] : []
        }),
  )

// 大きさが変わるときに保つ所。start は左（上）、center は真ん中
export type GrowFrom = "start" | "center"

// 置く・広げる・並べ直すときに base が読む、定義オブジェクトのメソッド（定義オブジェクトの拡張ポイントに書き足す）
// 置いた形のデータ D の項目の名前（データの型が決まっていなければ、どの名前でも）
type PropName<D extends ShapeData> = unknown extends D["props"] ? string : keyof D["props"] & string

declare module "../../../core/catalog" {
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    // キャプション（形の名前として見せる文字）の項目の名前。その項目が変わったときだけ、見える幅まで形を広げる（無ければ広げない）。
    // props にある名前かは、base の組み立ての確かめが見る（E028）
    captionProp?: PropName<D>
    // 個別のテーマ（この形だけ別のテーマで描く値）を持つ項目の名前。この項目だけをテーマの id として確かめる（無ければ見ない）。
    // props にある名前かは、base の組み立ての確かめが見る（E028）
    themeProp?: PropName<D>
    // 向きなどが違うだけの仲間の形をまとめて呼ぶ名前（台形と台形（逆）なら「台形」。文言の本当の鍵）。いくつものプラグインが使う見込みなので base が書き足す。
    // 文言の表にあるかは、base の組み立ての確かめが見る（E018）
    familyTitle?: MessageKey
    // キャプションが切れずに見える幅（キャプションで広げる幅と、縮めてよい横の下限）。無ければ size.w
    captionWidth?(item: D): number
    // キャプションが切れずに見える高さ（キャプションで縦に広げる高さと、縮めてよい縦の下限。文字を縦に置く形）。無いか null なら縦には広げない
    captionHeight?(item: D): number | null
    // 形をそのブックに合わせた形（並べ直すアクションが adaptPage でかける）。option はタイプがこのアイテムに渡す指定（items.options）、
    // setting はそのページで効いている設定の値。合わせることが無ければそのまま返す
    adapt?(item: D, option: unknown, setting: SettingReader): D
  }
  interface ConnectorItemExtras<D extends ConnectorData = ConnectorData> {
    // 形を並べ直したとき（整列など）のつなぐもの: 前の並びに合わせて手で決めた形（端の固定など）を外す。無ければそのまま。
    // 並べ直すアクションが unpinPage でかける
    unpin?(lines: readonly D[]): D[]
    // 形ごとページの中身を d だけずらしたときのつなぐもの（可変ページで、中身を印刷区画の単位でずらすとき。alignPadding がかける）。
    // 位置を自分で持つ物（手で直した点など）を一緒にずらす。areas はずらす前の形のつながる範囲。無ければそのまま
    shift?(lines: readonly D[], areas: ReadonlyMap<string, PortArea>, d: Point): D[]
    // 形をつながる範囲 areas の所に置いて描いたときの、つなぐもの全部の外枠（紙の座標。描くものが無ければ null）。
    // setting はそのページで効いている設定の値。並べるアクションが、形とつなぐものを合わせた広さを測るのに使う（extentOf）
    bounds?(lines: readonly D[], areas: ReadonlyMap<string, PortArea>, setting: SettingReader): Rect | null
    // どの印刷区画に属するか（載っているか）を決める、つなぐものの点（紙の上の座標 { x, y } の並び。ページのつなぐもの全部の分を 1 つに並べる）。
    // 利用者が手で決めた所を表す点で、線では、手で直した区間の折れ目がこれに当たる（手で直していない線は返さない）。両端は形が持つので入れない
    // （print-preview/filled.ts）。引数は bounds と同じ。無ければ、つなぐものはどの印刷区画にも載らない（形の印刷区画だけで決まる）
    printBelongingPoints?(lines: readonly D[], areas: ReadonlyMap<string, PortArea>, setting: SettingReader): Point[]
  }
  interface BookTypeExtras {
    // 中身（キャプション）で形の大きさが変わるときに、横と縦で保つ所。setting はそのページで効いている設定の値（設定で変えてよい）。
    // 無ければ左と上を保つ
    growFrom?(setting: SettingReader): { x: GrowFrom; y: GrowFrom }
  }
}

// ページの、2 つの形の組の間隔の下限（線でつながった組は広い。つなぐものの定義が決める）
export const gapOf = (catalog: CoreCatalog, page: ItemPage): Gap => connectorGaps(catalog, page, evenGap)

// 形が変わったあとのページ（つなぐものの定義の整えを全部かける。そのページで効いている設定の値で）
export const tidyPage = <P extends ItemPage>(catalog: CoreCatalog, book: PagedBook, page: P): P =>
  tidyItems(catalog, page, settingsAt(catalog, book, page))

// 次に置くアイテムの id（newId から振る。ブックの全部のページの中身の、どの深さの id とも重ならない。utils/ids.ts の contentIdMaker で振る）
export function nextItemId(book: PagedBook, newId: () => string): string {
  return contentIdMaker(book, newId)()
}

// 置く前のアイテムの大きさ（定義の大きさ。表に無いアイテムと、大きさを持たないアイテムは null）
export function itemSize(catalog: CoreCatalog, item: string): Size | null {
  return shapeDefOf(catalog, item)?.size ?? null
}

// 大きさを変えられるアイテムの、一番小さい大きさ（変えられないアイテムは null）
export function minSize(catalog: CoreCatalog, item: PlacedShape): Size | null {
  return shapeDefOf(catalog, item.item)?.min ?? null
}

// キャプションが切れずに見える幅（編集で縮めてよい横の下限と、キャプションで広げる幅。表に無いアイテムは 0）
const captionWidth = (catalog: CoreCatalog, item: PlacedShape): number => {
  const def = shapeDefOf(catalog, item.item)
  return def ? (def.captionWidth?.(item) ?? def.size.w) : 0
}

// キャプションが切れずに見える高さ（定義の captionHeight。無ければ null で、縦にはキャプションで広げない）
const captionHeight = (catalog: CoreCatalog, item: PlacedShape): number | null =>
  shapeDefOf(catalog, item.item)?.captionHeight?.(item) ?? null

// つかんだ辺（x は左か右、y は上か下。角なら両方）
export interface Edges {
  x?: "left" | "right"
  y?: "top" | "bottom"
}

// 辺をつかんで、紙の上で by だけ動かしたときの左上と大きさ。つかんでいない辺はそのまま。
// 一番小さい大きさより小さくせず、紙の外へは広げない（変えられないアイテムは null）
export function resizedBy(
  catalog: CoreCatalog,
  item: PlacedShape,
  edges: Edges,
  by: Point,
  paper: Size,
): { x: number; y: number; w: number; h: number } | null {
  const min = minSize(catalog, item)
  const size = placedSize(catalog, item)
  if (!min || !size) return null
  const span = (start: number, len: number, d: number, side: "start" | "end" | undefined, lo: number, max: number) => {
    if (side === "end") return { at: start, len: Math.min(Math.max(len + d, lo), max - start) }
    if (side !== "start") return { at: start, len }
    const end = start + len
    const at = Math.max(Math.min(start + d, end - lo), 0)
    return { at, len: end - at }
  }
  const h = span(item.x, size.w, by.x, edges.x && (edges.x === "left" ? "start" : "end"), min.w, paper.w)
  const v = span(item.y, size.h, by.y, edges.y && (edges.y === "top" ? "start" : "end"), min.h, paper.h)
  return { x: h.at, y: v.at, w: h.len, h: v.len }
}

// 中身を変えた形 next の大きさ: キャプションの項目（定義の captionProp）が変わって、キャプションが見える幅（20 字まで）より狭ければ、そこまで広げる。
// 文字を縦に置く形（定義の captionHeight を持つ形）は、見える高さまで縦にも広げる。
// 広げる向きはブックのタイプの growFrom（無ければ左・上を保って右・下へ。center なら真ん中を保って両側へ）で、紙からははみ出さない。
// 狭めはしない。キャプションが変わらないか、captionProp の無い形ならそのまま
export function widenForCaption(
  catalog: CoreCatalog,
  book: Book,
  page: ItemPage,
  before: PlacedShape,
  next: PlacedShape,
): PlacedShape {
  const prop = shapeDefOf(catalog, next.item)?.captionProp
  if (prop === undefined) return next
  const caption = (p: PlacedShape) => (p.props as Record<string, unknown>)[prop]
  if (caption(next) === caption(before)) return next
  const size = placedSize(catalog, next)
  const paper = roomOf(catalog, book, page)
  if (!size || !paper) return next
  const from = catalog.bookTypes.get(book.type)?.growFrom?.(settingsAt(catalog, book, page))
  // 1 つの向きに、want まで広げた位置と長さ（at は左か上、len は今の長さ、room は紙の長さ）
  const grow = (at: number, len: number, want: number, room: number, center: boolean) => {
    const to = Math.min(want, center ? room : room - at)
    if (to <= len) return { at, len }
    return { at: center ? Math.min(Math.max(0, Math.round(at - (to - len) / 2)), room - to) : at, len: to }
  }
  const x = grow(next.x, size.w, captionWidth(catalog, next), paper.w, from?.x === "center")
  const tall = captionHeight(catalog, next)
  const y = tall === null ? { at: next.y, len: size.h } : grow(next.y, size.h, tall, paper.h, from?.y === "center")
  if (x.len === size.w && y.len === size.h) return next
  return { ...next, x: x.at, y: y.at, w: x.len, h: y.len }
}

// 形の個別のテーマ（定義の themeProp が名指す項目）が表にあるか（themeProp の無い形と、値が無いときは true）
export function knownTheme(catalog: CoreCatalog, item: PlacedShape): boolean {
  const prop = shapeDefOf(catalog, item.item)?.themeProp
  if (prop === undefined) return true
  const theme = (item.props as Record<string, unknown>)[prop]
  return theme === undefined || (typeof theme === "string" && catalog.themes.has(theme))
}

// ページの紙の大きさ（描けない紙なら null）
export function paperSize(catalog: CoreCatalog, page: ItemPage): Size | null {
  const paper = resolvePaper(catalog, page)
  return paper.status === "unshowable" ? null : paper.size
}

// ブック book のページ page の増やす向き（可変ページでなければ undefined）。利用者が選ぶタイプは選んだ向き（選べない向きや true なら既定）、
// タイプが決めるタイプは、そのページで効いている設定の値から。いつも可変ページのタイプは、どのページもタイプの向き
export function growOf(catalog: CoreCatalog, book: Book, page: ItemPage): GrowSides | undefined {
  const rule = catalog.bookTypes.get(book.type)?.grow
  if (rule && "always" in rule) return rule.always
  if (!page.grows || !rule) return undefined
  if ("sides" in rule) return rule.sides(settingsAt(catalog, book, page))
  const chosen = page.grows === true || !rule.choices.includes(page.grows) ? rule.choices[0] : page.grows
  return chosen && GROW_CHOICE_SIDES[chosen]
}

// ブック book のページ page の広さ: 可変ページでなければ紙 1 枚。可変ページは、形とつなぐものの外枠が入るだけ印刷区画を並べた広さ
// （spare なら右・下へ増やす向きに空きの印刷区画を 1 つずつ足す。grow.ts の grownArea）。描けない紙なら null
export function pageArea(
  catalog: CoreCatalog,
  book: Book,
  page: ItemPage,
  spare = false,
): { columns: number; rows: number; size: Size } | null {
  const paper = paperSize(catalog, page)
  if (!paper) return null
  const grow = growOf(catalog, book, page)
  if (!grow) return { columns: 1, rows: 1, size: paper }
  return grownArea(paper, grow, extentOf(catalog, page, settingsAt(catalog, book, page)), spare)
}

// ページの形を置ける広さ（ページの Frame の大きさ）: 可変ページでなければ紙 1 枚。可変ページは、形の外枠が入るだけ並べた印刷区画に、
// 右・下へ増やす向きの空きを 1 つずつ足した広さ（空きへ置けば、また空きが出る）。つなぐものは測らない（道筋を計算し直さないため）。描けない紙なら null
export function roomOf(catalog: CoreCatalog, book: Book, page: ItemPage): Size | null {
  const paper = paperSize(catalog, page)
  const grow = growOf(catalog, book, page)
  if (!paper || !grow) return paper
  const rects = [...rectsOf(catalog, page).values()]
  const extent = rects.length
    ? {
        x: 0,
        y: 0,
        w: Math.max(...rects.map(r => r.x + r.w)),
        h: Math.max(...rects.map(r => r.y + r.h)),
      }
    : null
  return grownArea(paper, grow, extent, true).size
}

// ページを page に替える。形が変わったあとの線を整えてから（tidyPage）
export function withPage<B extends PagedBook>(catalog: CoreCatalog, book: B, page: ItemPage): B {
  return putPage(book, tidyPage(catalog, book, page))
}

// 押したあとのページ next に替える（withPage）。ただし、紙 paper の中にあった形と新しく置いた形が、描く大きさ（placedSize）で紙からはみ出すなら null。
// 押す計画の四角と描く大きさがずれても（子を持つ形は子より小さく描けないなど）、紙の外へは書かない。前から紙の外にある形は問わない
function pushedPage<B extends PagedBook>(
  catalog: CoreCatalog,
  book: B,
  page: ItemPage,
  next: ItemPage,
  paper: Size,
): B | null {
  const was = rectsOf(catalog, page)
  for (const [id, r] of rectsOf(catalog, next)) {
    const old = was.get(id)
    if ((!old || inPaper(old, paper)) && !inPaper(r, paper)) return null
  }
  return withPage(catalog, book, next)
}

// ページの形とつなぐものを、今の位置で描いたときの外枠（つなぐものは定義の bounds で測る）。何も描かなければ null。
// setting はそのページで効いている設定の値
export function extentOf(catalog: CoreCatalog, page: ItemPage, setting: SettingReader): Rect | null {
  const rects = rectsOf(catalog, page)
  const boxes: Rect[] = [...rects.values()]
  const areas = portAreasOf(catalog, page, rects)
  for (const [def, list] of byConnector(catalog, page)) {
    const b = def.bounds?.(list as ConnectorData[], areas, setting)
    if (b) boxes.push(b)
  }
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map(b => b.x))
  const y = Math.min(...boxes.map(b => b.y))
  return { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y }
}

// 形をそのブックに合わせたページ（整列など）: 形に、定義のブックへの合わせ（adapt）をかける。タイプがその形に渡す指定と、
// そのページで効いている設定の値で合わせる（context）。変わらなければそのまま
export function adaptPage<P extends ItemPage>(catalog: CoreCatalog, page: P, context: PageContext): P {
  const options = catalog.bookTypes.get(context.type)?.items.options as Record<string, unknown> | undefined
  let changed = false
  const items = pageItemsOf(page).map(i => {
    if (!isShape(i)) return i
    const def = shapeDefOf(catalog, i.item)
    const next = def?.adapt ? (def.adapt(i, options?.[i.item], context.setting) as PlacedShape) : i
    if (next !== i) changed = true
    return next
  })
  return changed ? { ...page, items } : page
}

// 可変ページの中身を、印刷区画の単位でずらしたページ: 形の外枠の左端（上端）が、左（上）から into.x（into.y）番目の印刷区画に来るようにする
// （1 なら左・上に空きの印刷区画を 1 つ持ち、0 なら持たない。無い向きはずらさない）。ずらした量（印刷区画の数）はページの shift に足す（0 なら消す）。
// つなぐものは、定義の shift で位置を持つ物も一緒にずらす。形の無いページ・ずらさなくてよいページはそのまま
export function alignPadding<P extends ItemPage>(catalog: CoreCatalog, page: P, into: { x?: 0 | 1; y?: 0 | 1 }): P {
  const paper = paperSize(catalog, page)
  if (!paper) return page
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
  const moved = { ...page, items }
  return setField(moved, ["orientation", "grows"], "shift", total.x === 0 && total.y === 0 ? undefined : total)
}

// ページ page のつなぐもののうち、by が量を返すものを、定義の shift で位置を持つ物ごとその量だけずらした物（id → ずらした物）。
// 定義に shift の無い種類と、by が null を返すものは入れない
function shiftedConnectors(
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

// 形を動かす前のページ page で、形ごとに動く量 moved（形の id → 紙の上の量。子の形は親の量で動く）を受けたときの、つなぐもの:
// 両端の形が同じだけ動くつなぐものは、定義の shift で位置を持つ物（線の手直しなど）も一緒にずらす。片方だけ・違う量で動くものはそのまま
export function followConnectors<P extends ItemPage>(
  catalog: CoreCatalog,
  page: P,
  moved: ReadonlyMap<string, Point>,
): P {
  const by = new Map<string, Point>()
  for (const { shape, parent } of walkShapes(page)) {
    const d = moved.get(shape.id) ?? (parent === null ? undefined : by.get(parent))
    if (d) by.set(shape.id, d)
  }
  const shifted = shiftedConnectors(catalog, page, c => {
    const a = by.get(c.from)
    const b = by.get(c.to)
    return a && b && a.x === b.x && a.y === b.y && (a.x !== 0 || a.y !== 0) ? a : null
  })
  return shifted.size === 0 ? page : { ...page, items: pageItemsOf(page).map(i => shifted.get(i.id) ?? i) }
}

// 可変ページの中身を、増やす向き sides に合わせてずらしたページ: 左（上）へ増やすなら左（上）に空きの印刷区画を 1 つ持たせ、
// 前は増やしていた（was）が増やさなくなった向きは空きを詰める（入らないかは shapesFit で確かめる）
export function paddedFor<P extends ItemPage>(
  catalog: CoreCatalog,
  page: P,
  sides: GrowSides | undefined,
  was: GrowSides | undefined,
): P {
  const axis = (now: boolean | undefined, before: boolean | undefined) => (now ? 1 : before ? 0 : undefined)
  return alignPadding(catalog, page, { x: axis(sides?.left, was?.left), y: axis(sides?.up, was?.up) })
}

// 形を並べ直したページ（整列など）: つなぐものに、定義の固定の外し（unpin）を種類ごとにかける（前の並びに合わせて手で決めた形を外す）。
// 変わらなければそのまま
export function unpinPage<P extends ItemPage>(catalog: CoreCatalog, page: P): P {
  const unpinned = new Map<string, PlacedConnector>()
  for (const [def, list] of byConnector(catalog, page)) {
    if (!def.unpin) continue
    for (const c of def.unpin(list as ConnectorData[])) unpinned.set(c.id, c as PlacedConnector)
  }
  if (unpinned.size === 0) return page
  return { ...page, items: pageItemsOf(page).map(i => unpinned.get(i.id) ?? i) }
}

// ページにアイテムを置く（id は nextItemId で振ったもの）。重なった相手は右へ、駄目なら下へ押し、それも駄目なら押した列を縮めて右へ・下へ（push.ts の planPlace）。
// 無いページ・はみ出す所・押した相手が収まらないなら null
export function placeItem<B extends PagedBook>(
  catalog: CoreCatalog,
  book: B,
  pageId: string,
  item: PlacedShape,
): B | null {
  const page = book.pages.find(p => p.id === pageId)
  const paper = page && roomOf(catalog, book, page)
  const size = placedSize(catalog, item)
  if (!page || !paper || !size) return null
  const after = planPlace(
    rectsOf(catalog, page),
    item.id,
    { x: item.x, y: item.y, ...size },
    paper,
    floorsOf(catalog, page),
    gapOf(catalog, page),
  )
  return after && pushedPage(catalog, book, page, { ...page, items: [...placedAt(catalog, page, after), item] }, paper)
}

// 描いている形の四角（紙の上）: 形ごとの左上と大きさに、ドラッグでずらして描く量（shift）を足したもの（大きさの分からない形は入れない）。
// 子の形も入れる。子は child で描く形とずらす量にし（無ければデータのまま、ずらさない）、親の左上と、親をずらして描く量を足す
export function shownRects(
  catalog: CoreCatalog,
  shapes: readonly { item: PlacedShape; shift: Point | null }[],
  child: (shape: PlacedShape) => { item: PlacedShape; shift: Point | null } = item => ({ item, shift: null }),
): Map<string, Rect> {
  const rects = new Map<string, Rect>()
  const walk = (list: readonly { item: PlacedShape; shift: Point | null }[], origin: Point, carried: Point) => {
    for (const { item, shift } of list) {
      const moved = { x: carried.x + (shift?.x ?? 0), y: carried.y + (shift?.y ?? 0) }
      const at = { x: origin.x + item.x, y: origin.y + item.y }
      const size = placedSize(catalog, item)
      if (size) rects.set(item.id, { x: at.x + moved.x, y: at.y + moved.y, ...size })
      walk(((item.shapes ?? []) as PlacedShape[]).map(child), at, moved)
    }
  }
  walk(shapes, { x: 0, y: 0 }, { x: 0, y: 0 })
  return rects
}

// 編集で縮めてよい下限（紙に収める）: 横がキャプションが全部見える幅、縦が一番低い高さ（箱はキャプション 1 行、リストは見出しと「＋」の行。
// 文字を縦に置く形はキャプションが全部見える高さ）。子を持つ形は、子がみな入る大きさより小さくしない（placed.ts の childrenSize）。
// 今それより小さければ今の大きさ
export function floorsOf(catalog: CoreCatalog, page: ItemPage): Floors {
  const floors = new Map<string, Size>()
  for (const i of shapesOf(page)) {
    const size = placedSize(catalog, i)
    if (!size) continue
    const children = childrenSize(catalog, i) ?? { w: 0, h: 0 }
    floors.set(i.id, {
      w: Math.min(size.w, Math.max(children.w, captionWidth(catalog, i))),
      h: Math.min(size.h, Math.max(children.h, captionHeight(catalog, i) ?? (minSize(catalog, i) ?? size).h)),
    })
  }
  return floors
}

// ページのアイテムを next に置き換え、近づきすぎた相手を押してどける（push.ts）。shrink なら、押した列が紙からはみ出すとき縮めて収める。
// 無いページ・無いアイテム・id の違うもの・はみ出す・押した相手が紙に収まらないなら null
export function replacePushing<B extends PagedBook>(
  catalog: CoreCatalog,
  book: B,
  pageId: string,
  next: PlacedShape,
  shrink: boolean,
): B | null {
  const page = book.pages.find(p => p.id === pageId)
  const paper = page && roomOf(catalog, book, page)
  const size = placedSize(catalog, next)
  if (!page || !paper || !size || !shapesOf(page).some(i => i.id === next.id)) return null
  const before = rectsOf(catalog, page)
  const gap = gapOf(catalog, page)
  const after = pushFrom(
    before,
    next.id,
    { x: next.x, y: next.y, ...size },
    paper,
    shrink ? floorsOf(catalog, page) : undefined,
    gap,
  )
  if (!after || newClash(before, after, gap)) return null
  const items = placedAt(catalog, page, after).map(i => (i.id === next.id ? next : i))
  return pushedPage(catalog, book, page, { ...page, items }, paper)
}

// ページのアイテムのうち、形の左上と大きさを四角 rects にしたもの（rects に無い形・変わらない形と線はそのまま。縮めた形は w・h を書く）
export function placedAt(catalog: CoreCatalog, page: ItemPage, rects: ReadonlyMap<string, Rect>): PlacedItem[] {
  return pageItemsOf(page).map(i => {
    if (!isShape(i)) return i
    const r = rects.get(i.id)
    const size = placedSize(catalog, i)
    if (!r || !size) return i
    const at = r.x !== i.x || r.y !== i.y ? { x: r.x, y: r.y } : {}
    const sized = r.w !== size.w || r.h !== size.h ? { w: r.w, h: r.h } : {}
    return Object.keys(at).length + Object.keys(sized).length > 0 ? { ...i, ...at, ...sized } : i
  })
}

// ページのアイテム ids（形も線も、どの深さの子の形も）を消す。形は子孫ごと消え、消した形につながる線も消える（tidyPage）。
// 無いページ・無いアイテムを含むなら null
export function removeItems<B extends PagedBook>(
  catalog: CoreCatalog,
  book: B,
  pageId: string,
  ids: readonly string[],
): B | null {
  const page = book.pages.find(p => p.id === pageId)
  if (!page) return null
  const targets = new Set(ids)
  const found = (p: ItemPage, id: string) => pageItemsOf(p).some(i => i.id === id) || findShape(p, id) !== undefined
  if (![...targets].every(id => found(page, id))) return null
  // ページのアイテムはまとめて除き、子の形は 1 つずつ除く（先に除いた祖先の子孫は、もう無い）
  let next: ItemPage = { ...page, items: pageItemsOf(page).filter(i => !targets.has(i.id)) }
  for (const id of targets) next = replaceShape(next, id, () => null) ?? next
  return withPage(catalog, book, next)
}

// ページの形 id の、一番上の祖先（ページの形）の id。ページの形なら自分。無ければ null
function rootOf(page: ItemPage, id: string): string | null {
  const found = findShape(page, id)
  if (!found) return null
  return found.parent === null ? id : rootOf(page, found.parent)
}

// ページのどの深さの形 id も f の返す形に置き換え、変えたあとの一番上の祖先の大きさで、近づきすぎたページの形を押してどける（縮めない。replacePushing）。
// f が null を返せば子孫ごと除く（祖先は縮むだけなので押さない）。無いページ・無い形・はみ出す・押した相手が紙に収まらないなら null
export function replaceShapePushing<B extends PagedBook>(
  catalog: CoreCatalog,
  book: B,
  pageId: string,
  id: string,
  f: (shape: PlacedShape) => PlacedShape | null,
): B | null {
  const page = book.pages.find(p => p.id === pageId)
  const root = page && rootOf(page, id)
  const next = page && replaceShape(page, id, f)
  if (!page || !root || !next) return null
  const grown = shapesOf(next).find(s => s.id === root)
  return grown ? replacePushing(catalog, book, pageId, grown, false) : withPage(catalog, book, next)
}

// ページの形 a と b の組が、間隔の下限（gapOf。線でつないだあとなど）より近ければ、a はそのままで b の側をどける
// （離れていた方の向きへ。押した先も押し、紙の端で詰まれば押された形を縮める）。どけられなければ null。近くなければそのまま
export function keepApart<B extends PagedBook>(
  catalog: CoreCatalog,
  book: B,
  pageId: string,
  a: string,
  b: string,
): B | null {
  const page = book.pages.find(p => p.id === pageId)
  const paper = page && roomOf(catalog, book, page)
  if (!page || !paper) return null
  const before = rectsOf(catalog, page)
  const ra = before.get(a)
  const rb = before.get(b)
  const gap = gapOf(catalog, page)
  if (!ra || !rb || a === b || !tooClose(ra, rb, gap(a, b))) return book
  const { axis, ahead } = apartWay(ra, rb)
  const len = axis === "x" ? "w" : "h"
  const at = ahead ? ra[axis] + ra[len] + gap(a, b) : ra[axis] - gap(a, b) - rb[len]
  const after = pushFrom(before, b, { ...rb, [axis]: at }, paper, floorsOf(catalog, page), gap)
  if (!after || newClash(before, after, gap)) return null
  return pushedPage(catalog, book, page, { ...page, items: placedAt(catalog, page, after) }, paper)
}

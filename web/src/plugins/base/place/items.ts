// ページに置いたアイテムの操作（データを書き換えず、新しい値を返す）。
// アイテムは紙から少しでもはみ出す所には置かず、動かさない。置いた・動かした・大きさか左上が変わったアイテムは、近づきすぎた相手をどける（push.ts）。
// 形が変わったあとは、ページのつなぐものの決まりで整える（placed.ts の tidyConnectors）
import type { CatalogCheckDef, CoreCatalog } from "../../../core/core-catalog"
import type { ConnectorData, ShapeData } from "../../../core/def/item"
import { problem } from "../../../core/errors"
import type { Point, Size } from "../../../core/geom"
import {
  byConnector,
  findShape,
  type ItemPage,
  isShape,
  NO_ITEM,
  type PlacedConnector,
  type PlacedItem,
  type PlacedShape,
  pageItemsOf,
  replaceShape,
  shapesOf,
  walkShapes,
} from "../../../core/placed"
import { themeFits } from "../book-look/theme-types"
import { type PageContext, type SettingReader, tidyPage } from "../book-settings"
import { contentIdMaker } from "../utils/ids"
import { roomOf, shiftedConnectors } from "./grow"
import { connectorGaps, NO_SHAPE_DEF, NO_SIZE, type PortArea, placedSize, rectsOf, shapeDefOf } from "./placed"
import { apartWay, evenGap, type Gap, inPaper, newClash, planPlace, pushFrom, type Rect, tooClose } from "./push"
import { floorsOf } from "./size"

// 形の仲間の名前（familyTitle）が文言の表にあるか（台帳アセンブルのときの確かめ）
export const FAMILY_TITLE_CHECK: CatalogCheckDef = catalog =>
  [...catalog.items.values()].flatMap(i => {
    const title = i.kind === "shape" ? i.familyTitle : undefined
    return title !== undefined && !catalog.messages.has(title)
      ? [problem("E018", { kind: "item", id: i.id, title })]
      : []
  })

// 形の captionProp・themeProp が、その形の props にある項目を名指しているか（台帳アセンブルのときの確かめ）
export const PROP_NAMES_CHECK: CatalogCheckDef = catalog =>
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
    // props にある名前かは、base の台帳アセンブルのときの確かめが見る（E028）
    captionProp?: PropName<D>
    // 個別のテーマ（この形だけ別のテーマで描く値）を持つ項目の名前。この項目だけをテーマの id として確かめる（無ければ見ない）。
    // props にある名前かは、base の台帳アセンブルのときの確かめが見る（E028）
    themeProp?: PropName<D>
    // 向きなどが違うだけの仲間の形をまとめて呼ぶ名前（台形と台形（逆）なら「台形」。文言の本当の鍵）。いくつものプラグインが使う見込みなので base が書き足す。
    // 文言の表にあるかは、base の台帳アセンブルのときの確かめが見る（E018）
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
  interface PageTypeExtras {
    // 中身（キャプション）で形の大きさが変わるときに、横と縦で保つ所。setting はそのページで効いている設定の値（設定で変えてよい）。
    // 無ければ左と上を保つ
    growFrom?(setting: SettingReader): { x: GrowFrom; y: GrowFrom }
  }
}

// ページの、2 つの形の組の間隔の下限（線でつながった組は広い。つなぐものの定義が決める）
export const gapOf = (catalog: CoreCatalog, page: ItemPage): Gap => connectorGaps(catalog, page, evenGap)

// 形が変わったあとのページの整え（book-settings の tidyPage）
export { tidyPage }

// ページ page に次に置くアイテムの id（newId から振る。そのページの中身の、どの深さの id とも重ならない）
export function nextItemId(page: ItemPage, newId: () => string): string {
  return contentIdMaker(page, newId)()
}

// 形の個別のテーマ（定義の themeProp が名指す項目）を、タイプ type のページで使えるか（book-look/theme-types.ts。themeProp の無い形と、値が無いときは true）
export function shapeThemeFits(catalog: CoreCatalog, type: string, item: { item: string; props: object }): boolean {
  const def = shapeDefOf(catalog, item.item)
  const prop = def !== NO_SHAPE_DEF ? def.themeProp : undefined
  if (prop === undefined) return true
  const theme = (item.props as Record<string, unknown>)[prop]
  return theme === undefined || (typeof theme === "string" && themeFits(catalog, type, theme))
}

// 置く・置き換える・消す・どけるができない（無いアイテム・はみ出す・押した相手が収まらない）
export const CANNOT_PLACE = "cannot"

// 押したあとのページ next を、線を整えて返す（tidyPage）。ただし、紙 paper の中にあった形と新しく置いた形が、描く大きさ（placedSize）で紙からはみ出すなら CANNOT_PLACE。
// 押す計画の四角と描く大きさがずれても（子を持つ形は子より小さく描けないなど）、紙の外へは書かない。前から紙の外にある形は問わない
function pushedPage(catalog: CoreCatalog, page: ItemPage, next: ItemPage, paper: Size): ItemPage | typeof CANNOT_PLACE {
  const was = rectsOf(catalog, page)
  for (const [id, r] of rectsOf(catalog, next)) {
    const old = was.get(id)
    if ((!old || inPaper(old, paper)) && !inPaper(r, paper)) return CANNOT_PLACE
  }
  return tidyPage(catalog, next)
}

// 形をそのブックに合わせたページ（整列など）: 形に、定義のブックへの合わせ（adapt）をかける。タイプがその形に渡す指定と、
// そのページで効いている設定の値で合わせる（context）。変わらなければそのまま
export function adaptPage<P extends ItemPage>(catalog: CoreCatalog, page: P, context: PageContext): P {
  const options = catalog.pageTypes.get(context.type)?.items.options as Record<string, unknown> | undefined
  let changed = false
  const items = pageItemsOf(page).map(i => {
    if (!isShape(i)) return i
    const def = shapeDefOf(catalog, i.item)
    const next =
      def !== NO_SHAPE_DEF && def.adapt ? (def.adapt(i, options?.[i.item], context.setting) as PlacedShape) : i
    if (next !== i) changed = true
    return next
  })
  return changed ? { ...page, items } : page
}

// 同じだけ動いたとみなす差（位置の引き算に出る浮動小数点の誤差より大きく、動かす量の刻みより小さい）
const SAME_SHIFT = 1e-6
const sameShift = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < SAME_SHIFT && Math.abs(a.y - b.y) < SAME_SHIFT

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
    return a && b && sameShift(a, b) && (a.x !== 0 || a.y !== 0) ? a : null
  })
  return shifted.size === 0 ? page : { ...page, items: pageItemsOf(page).map(i => shifted.get(i.id) ?? i) }
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
// はみ出す所・押した相手が収まらないなら CANNOT_PLACE
export function placeItem(catalog: CoreCatalog, page: ItemPage, item: PlacedShape): ItemPage | typeof CANNOT_PLACE {
  const paper = roomOf(catalog, page)
  const size = placedSize(catalog, item)
  if (size === NO_SIZE) return CANNOT_PLACE
  const after = planPlace(
    rectsOf(catalog, page),
    item.id,
    { x: item.x, y: item.y, ...size },
    paper,
    floorsOf(catalog, page),
    gapOf(catalog, page),
  )
  if (!after) return CANNOT_PLACE
  return pushedPage(catalog, page, { ...page, items: [...placedAt(catalog, page, after), item] }, paper)
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
      if (size !== NO_SIZE) rects.set(item.id, { x: at.x + moved.x, y: at.y + moved.y, ...size })
      walk(((item.shapes ?? []) as PlacedShape[]).map(child), at, moved)
    }
  }
  walk(shapes, { x: 0, y: 0 }, { x: 0, y: 0 })
  return rects
}

// ページのアイテムを next に置き換え、近づきすぎた相手を押してどける（push.ts）。shrink なら、押した列が紙からはみ出すとき縮めて収める。
// 無いアイテム・id の違うもの・はみ出す・押した相手が紙に収まらないなら CANNOT_PLACE
export function replacePushing(
  catalog: CoreCatalog,
  page: ItemPage,
  next: PlacedShape,
  shrink: boolean,
): ItemPage | typeof CANNOT_PLACE {
  const paper = roomOf(catalog, page)
  const size = placedSize(catalog, next)
  if (size === NO_SIZE || !shapesOf(page).some(i => i.id === next.id)) return CANNOT_PLACE
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
  if (!after || newClash(before, after, gap)) return CANNOT_PLACE
  const items = placedAt(catalog, page, after).map(i => (i.id === next.id ? next : i))
  return pushedPage(catalog, page, { ...page, items }, paper)
}

// ページのアイテムのうち、形の左上と大きさを四角 rects にしたもの（rects に無い形・変わらない形と線はそのまま。縮めた形は w・h を書く）
export function placedAt(catalog: CoreCatalog, page: ItemPage, rects: ReadonlyMap<string, Rect>): PlacedItem[] {
  return pageItemsOf(page).map(i => {
    if (!isShape(i)) return i
    const r = rects.get(i.id)
    const size = placedSize(catalog, i)
    if (!r || size === NO_SIZE) return i
    const at = r.x !== i.x || r.y !== i.y ? { x: r.x, y: r.y } : {}
    const sized = r.w !== size.w || r.h !== size.h ? { w: r.w, h: r.h } : {}
    return Object.keys(at).length + Object.keys(sized).length > 0 ? { ...i, ...at, ...sized } : i
  })
}

// ページのアイテム ids（形も線も、どの深さの子の形も）を消す。形は子孫ごと消え、消した形につながる線も消える（tidyPage）。
// 無いアイテムを含むなら CANNOT_PLACE
export function removeItems(
  catalog: CoreCatalog,
  page: ItemPage,
  ids: readonly string[],
): ItemPage | typeof CANNOT_PLACE {
  const targets = new Set(ids)
  const found = (p: ItemPage, id: string) => pageItemsOf(p).some(i => i.id === id) || findShape(p, id) !== NO_ITEM
  if (![...targets].every(id => found(page, id))) return CANNOT_PLACE
  // ページのアイテムはまとめて除き、子の形は 1 つずつ除く（先に除いた祖先の子孫は、もう無い）
  let next: ItemPage = { ...page, items: pageItemsOf(page).filter(i => !targets.has(i.id)) }
  for (const id of targets) {
    const out = replaceShape(next, id, () => null)
    if (out !== NO_ITEM) next = out
  }
  return tidyPage(catalog, next)
}

// ページの形 id の、一番上の祖先（ページの形）の id。ページの形なら自分。無ければ null
function rootOf(page: ItemPage, id: string): string | null {
  const found = findShape(page, id)
  if (found === NO_ITEM) return null
  return found.parent === null ? id : rootOf(page, found.parent)
}

// ページのどの深さの形 id も f の返す形に置き換え、変えたあとの一番上の祖先の大きさで、近づきすぎたページの形を押してどける（縮めない。replacePushing）。
// f が null を返せば子孫ごと除く（祖先は縮むだけなので押さない）。無い形・はみ出す・押した相手が紙に収まらないなら CANNOT_PLACE
export function replaceShapePushing(
  catalog: CoreCatalog,
  page: ItemPage,
  id: string,
  f: (shape: PlacedShape) => PlacedShape | null,
): ItemPage | typeof CANNOT_PLACE {
  const root = rootOf(page, id)
  if (root === null) return CANNOT_PLACE
  const next = replaceShape(page, id, f)
  if (next === NO_ITEM) return CANNOT_PLACE
  const grown = shapesOf(next).find(s => s.id === root)
  return grown ? replacePushing(catalog, page, grown, false) : tidyPage(catalog, next)
}

// ページの形 a と b の組が、間隔の下限（gapOf。線でつないだあとなど）より近ければ、a はそのままで b の側をどける
// （離れていた方の向きへ。押した先も押し、紙の端で詰まれば押された形を縮める）。どけられなければ CANNOT_PLACE。近くなければそのまま
export function keepApart(catalog: CoreCatalog, page: ItemPage, a: string, b: string): ItemPage | typeof CANNOT_PLACE {
  const paper = roomOf(catalog, page)
  const before = rectsOf(catalog, page)
  const ra = before.get(a)
  const rb = before.get(b)
  const gap = gapOf(catalog, page)
  if (!ra || !rb || a === b || !tooClose(ra, rb, gap(a, b))) return page
  const { axis, ahead } = apartWay(ra, rb)
  const len = axis === "x" ? "w" : "h"
  const at = ahead ? ra[axis] + ra[len] + gap(a, b) : ra[axis] - gap(a, b) - rb[len]
  const after = pushFrom(before, b, { ...rb, [axis]: at }, paper, floorsOf(catalog, page), gap)
  if (!after || newClash(before, after, gap)) return CANNOT_PLACE
  return pushedPage(catalog, page, { ...page, items: placedAt(catalog, page, after) }, paper)
}

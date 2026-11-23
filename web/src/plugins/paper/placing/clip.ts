// コピーして貼る: 選びから写しを作り（clipOf）、写しをページへ置く（pasted）。
// 写しは、写した形（子孫と中身ごと）と、両端が写した形（子孫も）の中にある線。read_book が返すアイテムのデータと同じ形で、関数を含まない。
// 形の位置（x・y）は、写したときの紙の上の左上（子の形も、根の形にして写す）。貼るときは id をページで重ならないように振り直す

import {
  allowedItems,
  type CoreCatalog,
  connectorSchema,
  connectorsOf,
  type Declined,
  findShape,
  type ItemPage,
  NO_ITEM,
  type PlacedConnector,
  type PlacedShape,
  type Point,
  pageItemsOf,
  type ShapeData,
  type Size,
  walkShapes,
} from "../../../plugin-api"
import {
  CANNOT_PLACE,
  placeChild,
  placedSize,
  placeItem,
  renewedIds,
  shapeDefOf,
  shapeThemeFits,
  survivesRenewedIds,
} from "../../base"
import { ancestorsOf, crowded, movedShapes, NO_FREE_SPOT } from "./crowd"
import { freeAt, parsePlaced, stepToward, subtreeOf } from "./items"

export interface Clip {
  shapes: PlacedShape[] // 写した形。x・y は紙の上の左上
  connectors: PlacedConnector[] // 両端が写した形の中にある線
}

// 選び selection（ページ page のアイテムの id）から作る写し。写せる形を選んでいなければ null、写せない形が混じれば "uncopyable"。
// 選んだ形の子孫は、その形と一緒に写す（祖先も選んでいる形は、根にしない）
export function clipOf(catalog: CoreCatalog, page: ItemPage, selection: readonly string[]): Clip | "uncopyable" | null {
  const chosen = new Set(selection)
  const roots = walkShapes(page).filter(
    s => chosen.has(s.shape.id) && !ancestorsOf(page, s.shape.id).some(a => chosen.has(a)),
  )
  if (roots.length === 0) return null
  if (
    !survivesRenewedIds(
      catalog,
      roots.map(r => r.shape),
    )
  )
    return "uncopyable"
  const inside = new Set(roots.flatMap(r => [...subtreeOf(page, r.shape.id)]))
  return {
    shapes: roots.map(r => ({ ...r.shape, x: r.at.x, y: r.at.y })),
    connectors: connectorsOf(page).filter(c => inside.has(c.from) && inside.has(c.to)),
  }
}

// 形の木にある id（根と、どの深さの子孫）
function shapeIds(shape: ShapeData): string[] {
  return [shape.id, ...(shape.shapes ?? []).flatMap(shapeIds)]
}

// 渡された形 raw を確かめた形。ページのタイプが置けるアイテム・使えるテーマ・写せる形だけ。子の形もたどる。通らなければ null
function parsedTree(catalog: CoreCatalog, page: Pick<ItemPage, "type">, raw: unknown): PlacedShape | null {
  if (typeof raw !== "object" || raw === null || typeof (raw as { item?: unknown }).item !== "string") return null
  const value = raw as { item: string; shapes?: unknown; [field: string]: unknown }
  if (!allowedItems(catalog, page).includes(value.item)) return null
  const shape = parsePlaced(catalog, value)
  if (
    !shape ||
    !shapeThemeFits(catalog, page.type, shape) ||
    shapeDefOf(catalog, shape.item)?.survivesRenewedIds === false
  )
    return null
  const children = Array.isArray(value.shapes) ? value.shapes : []
  return children.every(child => parsedTree(catalog, page, child) !== null) ? shape : null
}

// 写しの根の形が占める範囲（紙の上の左上と大きさ）
function boxOf(catalog: CoreCatalog, shapes: readonly PlacedShape[]): { origin: Point; size: Size } | null {
  const sizes = shapes.map(s => placedSize(catalog, s))
  if (sizes.length === 0 || sizes.some(s => s === null)) return null
  const origin = { x: Math.min(...shapes.map(s => s.x)), y: Math.min(...shapes.map(s => s.y)) }
  const far = {
    x: Math.max(...shapes.map((s, i) => s.x + (sizes[i]?.w ?? 0))),
    y: Math.max(...shapes.map((s, i) => s.y + (sizes[i]?.h ?? 0))),
  }
  return { origin, size: { w: far.x - origin.x, h: far.y - origin.y } }
}

// 貼ったときの、写しの大きさ（根の形が占める範囲）。大きさが決まらなければ null
export const clipSize = (catalog: CoreCatalog, clip: Clip): Size | null => boxOf(catalog, clip.shapes)?.size ?? null

export interface PasteArgs {
  parent?: string | undefined // 入れる先の形（無ければページ）。at はその左上から
  at?: Point | undefined // 写しの範囲の左上（無ければ入れる先の最初の空き）
  crowd?: "refuse" | "push" | undefined
  shapes: readonly unknown[]
  connectors?: readonly unknown[] | undefined
}

export interface Pasted {
  next: ItemPage
  items: string[] // 貼った根の形の id
  at: Point // 写しの範囲の左上
}

// 写しをページに貼ったページ。写しが使えない（ブックで使えないアイテム・テーマ・写せない形・壊れた線）・入れる先が無い・紙に収まらないなら null、
// ほかの形を動かすことになる（crowd が push でない）・空きが無いなら、断りの文
// ページ page の形 id が、子を入れられる形か（無い形なら、入れられない）
function nests(catalog: CoreCatalog, page: ItemPage, id: string): boolean {
  const found = findShape(page, id)
  return found !== NO_ITEM && !!shapeDefOf(catalog, found.shape.item)?.capabilities.includes("nests")
}

export function pasted(
  catalog: CoreCatalog,
  page: ItemPage,
  newId: () => string,
  args: PasteArgs,
): Pasted | Declined | null {
  const parsed = args.shapes.map(raw => parsedTree(catalog, page, raw))
  if (parsed.length === 0 || parsed.some(s => s === null)) return null
  const connectors = (args.connectors ?? []).map(raw => {
    const item = typeof raw === "object" && raw !== null ? (raw as { item?: unknown }).item : undefined
    const def = typeof item === "string" ? catalog.items.get(item) : undefined
    const ok = def?.kind === "connector" && allowedItems(catalog, page).includes(def.id)
    const result = ok ? connectorSchema(def).safeParse(raw) : null
    return result?.success ? (result.data as unknown as PlacedConnector) : null
  })
  if (connectors.some(c => c === null)) return null
  // 線の両端は、写した形の中の形
  const inside = new Set((parsed as PlacedShape[]).flatMap(shapeIds))
  if ((connectors as PlacedConnector[]).some(c => !inside.has(c.from) || !inside.has(c.to))) return null
  const copy = renewedIds(page, { shapes: parsed as PlacedShape[], connectors: connectors as PlacedConnector[] }, newId)
  const box = boxOf(catalog, copy.shapes)
  const parent = args.parent ?? null
  if (!box) return null
  if (parent !== null && !nests(catalog, page, parent)) return null
  const push = args.crowd === "push"
  const grows = new Set(parent === null ? [] : [parent, ...ancestorsOf(page, parent)])
  // 範囲の左上を at にして貼ったページと、動いたほかの形
  const tryAt = (at: Point) => {
    let placed: ItemPage | typeof CANNOT_PLACE = page
    for (const s of copy.shapes) {
      const to = { x: at.x + s.x - box.origin.x, y: at.y + s.y - box.origin.y }
      if (placed === CANNOT_PLACE) break
      placed =
        parent === null
          ? placeItem(catalog, placed, { ...s, ...to })
          : placeChild(catalog, placed, parent, { ...s, ...to }, to)
    }
    if (placed === CANNOT_PLACE) return null
    const pasted = placed
    if (!copy.shapes.every(s => findShape(pasted, s.id) !== NO_ITEM)) return null
    const withLines = { ...placed, items: [...pageItemsOf(placed), ...copy.connectors] }
    return { next: withLines, moved: movedShapes(catalog, page, placed, new Set(), grows) }
  }
  const calm = (at: Point) => {
    const tried = tryAt(at)
    return tried !== null && (push || tried.moved.length === 0)
  }
  const at = args.at ?? freeAt(catalog, page, parent, box.size, calm)
  if (!at)
    return {
      declined: `there is no free spot for it${push ? "" : ' (crowd "push" pushes the others)'}`,
      kind: NO_FREE_SPOT,
    }
  const tried = tryAt(at)
  if (!tried) return null
  if (!push && tried.moved.length > 0)
    return crowded(catalog, page, tried.moved, freeAt(catalog, page, parent, box.size, calm))
  return { next: tried.next, items: copy.shapes.map(s => s.id), at }
}

// 貼る場所 asked（写しの範囲の左上）に収まらないときの、収まる一番近い場所。asked に貼れるならそこ。
// 入れる先の最初の空きへ向けて 1px ずつ寄せる（stepToward）。どこにも貼れなければ null
export function nearestPaste(
  catalog: CoreCatalog,
  page: ItemPage,
  clip: Clip,
  parent: string | null,
  asked: Point,
): Point | null {
  const size = clipSize(catalog, clip)
  if (!size) return null
  let n = 0
  const fits = (at: Point) => {
    const done = pasted(catalog, page, () => `fit${n++}`, {
      ...(parent === null ? {} : { parent }),
      at,
      crowd: "push",
      shapes: clip.shapes,
      connectors: clip.connectors,
    })
    return done !== null && "next" in done
  }
  if (fits(asked)) return asked
  const spot = freeAt(catalog, page, parent, size, fits)
  return spot && stepToward(asked, spot, fits)
}

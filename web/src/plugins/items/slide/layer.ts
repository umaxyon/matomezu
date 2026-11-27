// スライドのレイヤーが描く物と、離したときに渡す値: ドラッグの途中の様子を重ねた形、複数を選んだときの全体の四角、選んだ 1 つ、
// ドラッグ枠で選ぶ物、なぞった点から置く四角と項目
import type { CoreCatalog, ItemId, PlacedShape, Point, Rect } from "../../../plugin-api"
import { NO_SIZE, placedSize, stretchOf, writesSize } from "../../base"
import {
  boundsOf,
  drawnRect,
  rectOf,
  rotationOf,
  round,
  roundRect,
  scaledFontSize,
  shapeProps,
  thinned,
  touches,
  unionOf,
} from "./rect"
import {
  DEFAULT_FONT_SIZE,
  FREE_LINE,
  linePropsOf,
  MIN_SIZE,
  movedLineProps,
  ROTATES,
  STRAIGHT_LINE,
  TEXT_FRAME,
} from "./slide"

// 押しただけとみなす動き（紙の上の px）と、自由な線の点の間引きの間
export const CLICK = 4
const THIN = 3

const TEXT = TEXT_FRAME.id
const FREE = FREE_LINE.id
const LINE = STRAIGHT_LINE.id

// ドラッグの途中の様子（離すまで、アクションは呼ばない）
export interface Live {
  item: string
  rect: Rect
  rotation?: number
  scaled?: boolean
  points?: Point[] // 点を動かしている途中の線の点（枠の中の割合）
}

// アイテム item の一番小さい大きさ（幅と高さの大きい方。定義に無ければ MIN_SIZE）
export function minSizeOf(catalog: CoreCatalog, item: string): number {
  const def = catalog.items.get(item)
  return def?.kind === "shape" && def.min ? Math.max(def.min.w, def.min.h) : MIN_SIZE
}

// なぞった点 points に、置こうとしているアイテム item を置く四角と項目（なぞれていなければ、置くときの大きさで始めの点に。置かないなら null）。
// zoom はステージの倍率（押しただけとみなす動きと、自由な線の点の間引きの間を、紙の上の px にする）。
// given は置こうとしている物が持つ項目（スクラップトレイから置くスクラップなど）。大きさが項目で決まる形は、なぞらず、始めの点にその項目のまま置く
export function drawnPlacement(
  catalog: CoreCatalog,
  item: ItemId,
  points: readonly Point[],
  zoom: number,
  given?: Record<string, unknown>,
): { rect: Rect; props: Record<string, unknown> } | null {
  const def = catalog.items.get(item)
  const from = points[0]
  const to = points.at(-1)
  if (!from || !to || def?.kind !== "shape") return null
  if (writesSize(catalog, item)) {
    const props = given ?? {}
    const size = placedSize(catalog, { id: "", x: 0, y: 0, item, props } as PlacedShape)
    return size === NO_SIZE ? null : { rect: roundRect({ x: from.x, y: from.y, ...size }), props }
  }
  const moved = Math.hypot(to.x - from.x, to.y - from.y) >= CLICK / zoom
  if (item === LINE || item === FREE) {
    if (!moved) return null
    const dense = item === FREE ? thinned(points, THIN / zoom) : [from, to]
    const { rect, fractions } = drawnRect(dense.slice(0, 500), minSizeOf(catalog, item))
    const props = linePropsOf(item, fractions)
    return { rect: roundRect(rect), props }
  }
  const rect = moved
    ? drawnRect([from, to], minSizeOf(catalog, item)).rect
    : { x: from.x, y: from.y, w: def.size.w, h: def.size.h }
  return { rect: roundRect(rect), props: item === TEXT ? { text: "" } : {} }
}

// 動かす物 items（動かす前の四角）を、紙の上で by だけ動かした先（位置は丸める）
export function movesBy(items: readonly { id: string; rect: Rect }[], by: Point): { item: string; at: Point }[] {
  return items.map(i => ({
    item: i.id,
    at: { x: round(i.rect.x + by.x), y: round(i.rect.y + by.y) },
  }))
}

// ドラッグ枠 swept で選ぶ物: 前の選び base に、枠にかかったアイテム（回した外枠で見る）を足したもの
export function sweptSelection(shapes: readonly PlacedShape[], base: readonly string[], swept: Rect): string[] {
  const hit = shapes.filter(s => touches(boundsOf(rectOf(s), rotationOf(s)), swept)).map(s => s.id)
  return [...base, ...hit.filter(id => !base.includes(id))]
}

// 描く形（ドラッグの途中のアイテムは、動かした先の枠・角度で。角のつまみなら文字の大きさも）。shift は動かしている途中の、動かす物と動いた量
export function shownShapes(
  shapes: readonly PlacedShape[],
  shift: { ids: ReadonlySet<string>; by: Point } | null,
  live: Live | null,
): PlacedShape[] {
  return shapes.map(s => {
    if (shift?.ids.has(s.id)) return { ...s, x: s.x + shift.by.x, y: s.y + shift.by.y } as PlacedShape
    if (!live || live.item !== s.id) return s
    const props = shapeProps(s)
    const scaledSize =
      live.scaled && s.item === TEXT && s.w
        ? { fontSize: scaledFontSize((props.fontSize as number | undefined) ?? DEFAULT_FONT_SIZE, live.rect.w, s.w) }
        : {}
    return {
      ...s,
      ...live.rect,
      props: {
        ...props,
        ...scaledSize,
        ...(live.rotation === undefined ? {} : { rotation: live.rotation }),
        ...(live.points ? movedLineProps(s.item, live.points) : {}),
      },
    } as PlacedShape
  })
}

// 複数を選んでいるとき（描く形 shown のうち selection にある物が 2 つ以上）の、全体を囲む四角と、バーに渡す物。そうでなければ null
export function groupOf(shown: readonly PlacedShape[], selection: readonly string[]) {
  const chosenShown = shown.filter(s => selection.includes(s.id))
  const groupRect = chosenShown.length > 1 ? unionOf(chosenShown.map(s => boundsOf(rectOf(s), rotationOf(s)))) : null
  return (
    groupRect && {
      rect: groupRect,
      subjects: chosenShown.map(s => ({ id: s.id, item: s.item, props: shapeProps(s) })),
    }
  )
}

// 選んだ 1 つのつまみとバーに渡す物（選んだ 1 つが無ければ null）: 回せるか（ケイパビリティ ROTATES）と、大きさを変えられる向き（base の stretch）も
export function selectedItemOf(catalog: CoreCatalog, current: PlacedShape | undefined) {
  return current
    ? {
        id: current.id,
        rect: rectOf(current),
        rotation: rotationOf(current),
        kind: current.item,
        props: shapeProps(current),
        rotates: catalog.items.get(current.item)?.capabilities.includes(ROTATES) ?? false,
        stretch: stretchOf(catalog, current.item),
      }
    : null
}

// 描く形の並び: どの形にも、描く大きさ（base の placedSize。大きさが項目で決まる形は項目から）を w・h に書く。データには戻さない
export const sizedShapes = (catalog: CoreCatalog, shapes: readonly PlacedShape[]): PlacedShape[] =>
  shapes.map(s => {
    const size = placedSize(catalog, s)
    return size === NO_SIZE ? s : { ...s, w: size.w, h: size.h }
  })

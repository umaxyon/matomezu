// ページに置いたアイテムのデータ: 外枠（形は id・左上・大きさ・子の形、つなぐものは id・つなぐ相手）と、アイテムの項目と中身。
// 外枠は kind ごとにここで決め、アイテムの定義は項目と中身のフィールドだけを持つ。ページの形は、ブックのタイプが選んだアイテムから機能台帳が組み立てる（catalog.ts）。
// 関係の決まりは、ページのつなぐもの（線）の定義が持つものを全部かける（形が変わったあとの整えは base の place/placed.ts）
import { z } from "zod"
import type { ItemTable } from "./catalog"
import type { CoreCatalog } from "./core-catalog"
import type { ConnectorData, ConnectorItemDef, ItemDef, ShapeData, ShapeItemDef } from "./def/item"
import type { Point } from "./geom"
import type { Page } from "./schema/page"

// 子の形の形を渡されないときの子の形: id・item・位置だけを確かめ、ほかのフィールドはそのまま残す
const LOOSE_SHAPE = z.looseObject({ id: z.string().min(1), item: z.string().min(1), x: z.number(), y: z.number() })

// 置いた形のデータの形。フィールドの並びは id・x・y・item・w・h・props・中身・子の形（shapes）。
// 子の形の並びを持てるのは能力 nests のある形だけで、空の並びは持たない。child は子の形 1 つの形（ブックの形を組み立てるときに、タイプが選んだ形を渡す）
export function shapeSchema(def: ShapeItemDef, child: z.ZodType = LOOSE_SHAPE): z.ZodObject {
  const len = (min: number | undefined) => (min === undefined ? z.number() : z.number().min(min)).optional()
  return z.strictObject({
    id: z.string().min(1),
    x: z.number(),
    y: z.number(),
    item: z.literal(def.id),
    w: len(def.min?.w),
    h: len(def.min?.h),
    props: def.props,
    ...Object.fromEntries(Object.entries(def.content ?? {}).map(([k, v]) => [k, v.optional()])),
    ...(def.capabilities.includes("nests") ? { shapes: z.array(child).min(1).optional() } : {}),
  })
}

// 置いたつなぐもののデータの形。フィールドの並びは id・item・from・to・props
export function connectorSchema(def: ConnectorItemDef): z.ZodObject {
  return z.strictObject({
    id: z.string().min(1),
    item: z.literal(def.id),
    from: z.string().min(1), // 始点の形の id
    to: z.string().min(1), // 終点の形の id（from と同じなら自分に戻る）
    props: def.props,
  })
}

export const placedSchema = (def: ItemDef, child?: z.ZodType): z.ZodObject =>
  def.kind === "shape" ? shapeSchema(def, child) : connectorSchema(def)

// アイテム K を置いたデータの型
type ContentData<D> = D extends { content?: infer C }
  ? { [K in keyof NonNullable<C>]?: NonNullable<C>[K] extends z.ZodType ? z.output<NonNullable<C>[K]> : never }
  : object
type PropsOf<D> = D extends { props: infer P extends z.ZodType } ? z.output<P> : never
export type PlacedOf<K extends string> = K extends keyof ItemTable
  ? ItemTable[K] extends { kind: "shape" }
    ? Omit<ShapeData<PropsOf<ItemTable[K]>>, "item"> & { item: K } & ContentData<ItemTable[K]>
    : Omit<ConnectorData<PropsOf<ItemTable[K]>>, "item"> & { item: K }
  : never
// 表のどのアイテムかを置いたデータ
export type PlacedItem = PlacedOf<keyof ItemTable & string>
export type PlacedShape = Extract<PlacedItem, { x: number }>
export type PlacedConnector = Exclude<PlacedItem, { x: number }>

// アイテムを置くページ（ページの形に、置いたアイテムの並び。重ねの順）
export type ItemPage = Page & { items?: readonly PlacedItem[] }

const connectorDef = (catalog: CoreCatalog, item: string): ConnectorItemDef | null => {
  const def = catalog.items.get(item)
  return def?.kind === "connector" ? def : null
}

export const pageItemsOf = (page: ItemPage): readonly PlacedItem[] => page.items ?? []
export const isShape = (item: PlacedItem): item is PlacedShape => "x" in item
// ページの形（重ねの順）
export const shapesOf = (page: ItemPage): PlacedShape[] => pageItemsOf(page).filter(isShape)
// ページのつなぐもの
export const connectorsOf = (page: ItemPage): PlacedConnector[] =>
  pageItemsOf(page).filter((i): i is PlacedConnector => !isShape(i))

// 子までたどった形: 形と、親の形の id（ページの形は null）と、紙の上の左上
export interface ShapeOnPage {
  shape: PlacedShape
  parent: string | null
  at: Point
}

// ページの形を子まで深さごとにたどる（親の次にその子孫。描く順）
export function walkShapes(page: ItemPage): ShapeOnPage[] {
  const walk = (shapes: readonly ShapeData[], parent: string | null, origin: Point): ShapeOnPage[] =>
    shapes.flatMap(shape => {
      const at = { x: origin.x + shape.x, y: origin.y + shape.y }
      return [{ shape: shape as PlacedShape, parent, at }, ...walk(shape.shapes ?? [], shape.id, at)]
    })
  return walk(shapesOf(page), null, { x: 0, y: 0 })
}

// ページの中のどの深さの形も、id で探す
export const findShape = (page: ItemPage, id: string): ShapeOnPage | undefined =>
  walkShapes(page).find(s => s.shape.id === id)

// つなぐものを種類ごとに分ける（表に無いものは入れない）
function byConnector(catalog: CoreCatalog, page: ItemPage): [ConnectorItemDef, PlacedConnector[]][] {
  const groups = new Map<string, PlacedConnector[]>()
  for (const c of connectorsOf(page)) {
    const list = groups.get(c.item)
    if (list) list.push(c)
    else groups.set(c.item, [c])
  }
  return [...groups].flatMap(([id, list]) => {
    const def = connectorDef(catalog, id)
    return def ? [[def, list] as [ConnectorItemDef, PlacedConnector[]]] : []
  })
}

// ページの形 id（どの深さの形でも）が、つなげる形（connectable）か
// 機能台帳に無い形は、何ができるか分からないので、つなげる物として扱う（前につないだ線のあるブックを読めるように）
export function connectableShape(catalog: CoreCatalog, page: ItemPage, id: string): boolean {
  const shape = findShape(page, id)?.shape
  return !!shape && isConnectable(catalog, shape)
}

const isConnectable = (catalog: CoreCatalog, shape: PlacedShape): boolean => {
  const def = catalog.items.get(shape.item)
  return def ? def.capabilities.includes("connectable") : true
}

// ページが、つなぐものの定義の関係の決まり（holds）を全部守っているか。つなげる形は、ページを 1 回たどって集める
export function pageHolds(catalog: CoreCatalog, page: ItemPage): boolean {
  const groups = byConnector(catalog, page)
  if (groups.length === 0) return true
  const connectable = new Set(
    walkShapes(page)
      .filter(s => isConnectable(catalog, s.shape))
      .map(s => s.shape.id),
  )
  return groups.every(([def, list]) => def.holds?.(list as ConnectorData[], id => connectable.has(id)) ?? true)
}

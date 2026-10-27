// ページに置いたアイテムのデータ: 外枠（形は id・左上・大きさ、つなぐものは id・つなぐ相手）と、アイテムの項目と中身。
// 外枠は kind ごとにここで決め、アイテムの定義は項目と中身のフィールドだけを持つ。ページの形は、ブックのタイプが選んだアイテムから機能台帳が組み立てる（catalog.ts）。
// 関係の決まりは、ページのつなぐもの（線）の定義が持つものを全部かける（形が変わったあとの整えは base の place/placed.ts）
import { z } from "zod"
import type { ItemTable } from "./catalog"
import type { CoreCatalog } from "./core-catalog"
import type { ConnectorData, ConnectorItemDef, ItemDef, ShapeData, ShapeItemDef } from "./def/item"
import type { Page } from "./schema/page"

// 置いた形のデータの形。フィールドの並びは id・x・y・item・w・h・props・中身
export function shapeSchema(def: ShapeItemDef): z.ZodObject {
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

export const placedSchema = (def: ItemDef): z.ZodObject =>
  def.kind === "shape" ? shapeSchema(def) : connectorSchema(def)

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

// つなぐものを種類ごとに分ける（表に無いものは入れない）
function byConnector(catalog: CoreCatalog, page: ItemPage): [ConnectorItemDef, PlacedConnector[]][] {
  const groups = new Map<string, PlacedConnector[]>()
  for (const c of connectorsOf(page)) groups.set(c.item, [...(groups.get(c.item) ?? []), c])
  return [...groups].flatMap(([id, list]) => {
    const def = connectorDef(catalog, id)
    return def ? [[def, list] as [ConnectorItemDef, PlacedConnector[]]] : []
  })
}

// ページの形 id が、つなげる形（connectable）か
// 機能台帳に無い形は、何ができるか分からないので、つなげる物として扱う（前につないだ線のあるブックを読めるように）
export function connectableShape(catalog: CoreCatalog, page: ItemPage, id: string): boolean {
  const shape = shapesOf(page).find(s => s.id === id)
  if (!shape) return false
  const def = catalog.items.get(shape.item)
  return def ? def.capabilities.includes("connectable") : true
}

// ページが、つなぐものの定義の関係の決まり（holds）を全部守っているか
export function pageHolds(catalog: CoreCatalog, page: ItemPage): boolean {
  return byConnector(catalog, page).every(
    ([def, list]) => def.holds?.(list as ConnectorData[], id => connectableShape(catalog, page, id)) ?? true,
  )
}

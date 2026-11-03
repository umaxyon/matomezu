// データのアクション: 中身の表を丸ごと入れ替える（data-set）。見た目・文字・軸も一緒に変えられる
import { z } from "zod"
import { findShape, hasPages, type PlacedShape } from "../../../plugin-api"
import { contentIdMaker, replaceShapePushing, roomOf, textPatch, widenForCaption } from "../../base"
import { settleAxes } from "./axes"
import {
  BAR_DIRECTIONS,
  CROWDS,
  DATA,
  DATA_VIEWS,
  DataPropsSchema,
  MAX_SERIES,
  SERIES_CHARTS,
  SKIPS,
  SORTS,
  TEXT_ATS,
} from "./data"
import { kit } from "./kit"
import { fitTable } from "./size"
import { CellSchema, COLUMN_TYPES, cellsFit, TableSchema } from "./table"

// 入れる列と行（id を書けば、今の表にあるその列・行の id を保つ。書かなければ新しく振る）
const NewColumnSchema = z.strictObject({
  id: z.string().min(1).optional(),
  name: z.string(),
  type: z.enum(COLUMN_TYPES),
})
const NewRowSchema = z.strictObject({ id: z.string().min(1).optional(), cells: z.array(CellSchema) })

// 表と一緒に変える項目（書いた項目だけを変え、null は消して既定に戻す）。軸の列と選んだ行は、columns・rows の位置（0 から）で書く
// （足したばかりの列と行は、まだ id を持たないため）
const position = z.number().int().min(0)
const PropsSchema = z.strictObject({
  ...textPatch(),
  textAt: z.enum(TEXT_ATS).nullable().optional(),
  view: z.enum(DATA_VIEWS).nullable().optional(),
  x: position.nullable().optional(),
  series: z
    .array(z.strictObject({ column: position, chart: z.enum(SERIES_CHARTS).optional() }))
    .max(MAX_SERIES)
    .nullable()
    .optional(),
  label: position.nullable().optional(),
  bar: z.enum(BAR_DIRECTIONS).nullable().optional(),
  sort: z.enum(SORTS).nullable().optional(),
  sortBy: position.nullable().optional(),
  crowd: z.enum(CROWDS).nullable().optional(),
  skip: z.enum(SKIPS).nullable().optional(),
  picked: z.array(position).nullable().optional(),
})
type DataSetProps = z.infer<typeof PropsSchema>

// 位置で書いた項目を、列と行の id で名指す項目に直す（無い位置を書いたなら null）
function propsByIds(
  props: DataSetProps,
  columns: readonly string[],
  rows: readonly string[],
): Record<string, unknown> | null {
  const { x, series, label, sortBy, picked, ...rest } = props
  const missing = (ids: readonly string[], at: readonly number[]) => at.some(i => ids[i] === undefined)
  const refs = [x, label, sortBy, ...(series ?? []).map(s => s.column)].filter(
    (i): i is number => typeof i === "number",
  )
  if (missing(columns, refs) || (picked && missing(rows, picked))) return null
  const column = (i: number | null | undefined) => (typeof i === "number" ? columns[i] : i)
  const out: Record<string, unknown> = { ...rest }
  if (x !== undefined) out.x = column(x)
  if (label !== undefined) out.label = column(label)
  if (sortBy !== undefined) out.sortBy = column(sortBy)
  if (series !== undefined) out.series = series?.map(s => ({ ...s, column: column(s.column) })) ?? null
  if (picked !== undefined) out.picked = picked?.map(i => rows[i]) ?? null
  return out
}

// 今の項目 now に、書いた項目 patch を重ねる（null は消す。データの項目の形に合わなければ null）
function patchedProps(now: Record<string, unknown>, patch: Record<string, unknown>) {
  const props = Object.fromEntries(Object.entries({ ...now, ...patch }).filter(([, v]) => v !== null))
  const parsed = DataPropsSchema.safeParse(props)
  return parsed.success ? parsed.data : null
}

// 書いた id が、今の表の id か（無い id や、重ねて書いた id なら false）
function keepsIds(now: readonly { id: string }[] | undefined, given: readonly (string | undefined)[]): boolean {
  const known = new Set((now ?? []).map(x => x.id))
  const ids = given.filter((id): id is string => id !== undefined)
  return ids.every(id => known.has(id)) && new Set(ids).size === ids.length
}

// データ item の表を、columns と rows で丸ごと入れ替える。props を書けば、見た目・文字・軸も一緒に変える（item-update と同じく書いた項目だけ。軸は列の位置で書く）。
// 表の見た目なら、表と文字の領域が全部見える大きさ（紙の端まで）に合わせ、ほかの見た目でキャプションが変わったら、見える幅まで広げる（widenForCaption）。
// 列が無ければ表を消す（No Data に戻す）。行のセルが列の数と型に合わない・今の表に無い id を書いた・props が無い位置を書いたか項目に合わない・データでないなら断る
export const DATA_SET = kit.defineAction({
  id: "data-set",
  attach: { items: [DATA.id] },
  aiDescription:
    "Replace the whole table of a data item (@matomezu/data:shape-data). Each column has a name and a type, number or text; each row has one cell per column, in column order: a finite number in a number column, a string in a text column. No cell may be empty: write 0 where a number is missing. A column or row given with the id of one in the table now keeps that id (and what refers to it); one without an id gets a new id. While the item shows the table (view table), it is resized to show the whole table, up to the paper's edge, pushing the items it would come too close to (when they cannot move, it keeps its size); a column is as wide as its longest text and a row is one line high. With no columns, the table is removed and the item shows No Data. props, when given, changes the item's look, text and axes together with the table, as @matomezu/paper:item-update does (only the props given; null removes one), except that x, series columns, label and sortBy are positions (from 0) in columns and picked are positions in rows, so a new column or row can be named before it has an id; outside the table view, a caption that grows widens the item to show it. It is refused when a row's cells do not fit the columns, when an id is not in the table now, or when props names a position that is not there or does not fit the item. Axes naming a column that is gone or no longer a number column are dropped. Returns the ids of the columns and rows, in order. read_book shows the table in the item's table field.",
  title: "Set data",
  target: "book",
  args: z.strictObject({
    page: z.string().min(1),
    item: z.string().min(1),
    columns: z.array(NewColumnSchema),
    rows: z.array(NewRowSchema),
    props: PropsSchema.optional(),
  }),
  permissionScope: { page: "page", item: "item" },
  run: (book, args, ctx) => {
    if (!hasPages(book)) return null
    const page = book.pages.find(p => p.id === args.page)
    const now = page && findShape(page, args.item)?.shape
    if (!now || now.item !== DATA.id) return null
    const before = now.table
    if (args.columns.length === 0) {
      if (args.rows.length > 0) return null
      const patch = args.props ? propsByIds(args.props, [], []) : {}
      const props = patch && patchedProps(now.props, patch)
      if (!props) return null
      const { table: _, ...rest } = now
      const emptied = { ...rest, props }
      const shown = widenForCaption(ctx.catalog, book, page, now, emptied as PlacedShape)
      const next =
        replaceShapePushing(ctx.catalog, book, args.page, args.item, () => shown) ??
        (shown !== emptied ? replaceShapePushing(ctx.catalog, book, args.page, args.item, () => emptied) : null)
      return next && { next, result: { columns: [], rows: [] } }
    }
    const columnIds = args.columns.map(c => c.id)
    const rowIds = args.rows.map(r => r.id)
    if (!keepsIds(before?.columns, columnIds) || !keepsIds(before?.rows, rowIds)) return null
    if (!args.rows.every(r => cellsFit(args.columns, r.cells))) return null
    const newId = contentIdMaker(book, ctx.newId)
    const table = TableSchema.safeParse({
      columns: args.columns.map(c => ({ id: c.id ?? newId(), name: c.name, type: c.type })),
      rows: args.rows.map(r => ({ id: r.id ?? newId(), cells: r.cells })),
    })
    if (!table.success) return null
    const columns = table.data.columns.map(c => c.id)
    const rows = table.data.rows.map(r => r.id)
    const patch = args.props ? propsByIds(args.props, columns, rows) : {}
    const patched = patch && patchedProps(now.props, patch)
    if (!patched) return null
    // 軸は新しい表に合わせる（無くなった列の軸を外し、グラフで軸が無ければ既定の列を選ぶ）
    const props = settleAxes(patched, table.data)
    // 表の見た目なら、表と文字の領域が全部見える大きさ（紙の端で止める）に合わせる。合わせて置けなければ、大きさはそのまま
    const paper = roomOf(ctx.catalog, book, page)
    const onPage = page.items?.some(i => i.id === args.item) ?? false
    const room = paper && (onPage ? { w: paper.w - now.x, h: paper.h - now.y } : paper)
    const fitted = props.view === "table" && room ? fitTable(table.data, props, room) : null
    const item = { ...now, props, table: table.data }
    // 表に合わせないときは、キャプションが見える幅まで広げる（広げて置けなければ、大きさはそのまま）
    const shown = fitted ? item : widenForCaption(ctx.catalog, book, page, now, item as PlacedShape)
    const next =
      (fitted && replaceShapePushing(ctx.catalog, book, args.page, args.item, () => ({ ...item, ...fitted }))) ??
      (shown !== item ? replaceShapePushing(ctx.catalog, book, args.page, args.item, () => shown) : null) ??
      replaceShapePushing(ctx.catalog, book, args.page, args.item, () => item)
    return (
      next && {
        next,
        result: { columns, rows },
      }
    )
  },
})

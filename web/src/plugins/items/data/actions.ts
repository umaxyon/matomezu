// データのアクション: 中身の表を丸ごと入れ替える（data-set）
import { z } from "zod"
import { findShape, hasPages } from "../../../plugin-api"
import { contentIdMaker, paperSize, replaceShapePushing } from "../../base"
import { settleAxes } from "./axes"
import { DATA } from "./data"
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

// 書いた id が、今の表の id か（無い id や、重ねて書いた id なら false）
function keepsIds(now: readonly { id: string }[] | undefined, given: readonly (string | undefined)[]): boolean {
  const known = new Set((now ?? []).map(x => x.id))
  const ids = given.filter((id): id is string => id !== undefined)
  return ids.every(id => known.has(id)) && new Set(ids).size === ids.length
}

// データ item の表を、columns と rows で丸ごと入れ替える。表の見た目なら、表と文字の領域が全部見える大きさ（紙の端まで）に合わせる。列が無ければ表を消す（No Data に戻す）。
// 行のセルが列の数と型に合わない・今の表に無い id を書いた・データでないなら断る
export const DATA_SET = kit.defineAction({
  id: "data-set",
  attach: { items: [DATA.id] },
  aiDescription:
    "Replace the whole table of a data item (@matomezu/data:shape-data). Each column has a name and a type, number or text; each row has one cell per column, in column order: a finite number in a number column, a string in a text column. No cell may be empty: write 0 where a number is missing. A column or row given with the id of one in the table now keeps that id (and what refers to it); one without an id gets a new id. While the item shows the table (view table), it is resized to show the whole table, up to the paper's edge, pushing the items it would come too close to (when they cannot move, it keeps its size); a column is as wide as its longest text and a row is one line high. With no columns, the table is removed and the item shows No Data. It is refused when a row's cells do not fit the columns, or when an id is not in the table now. Axes naming a column that is gone or no longer a number column are dropped. Returns the ids of the columns and rows, in order. read_book shows the table in the item's table field.",
  title: "Set data",
  target: "book",
  args: z.strictObject({
    page: z.string().min(1),
    item: z.string().min(1),
    columns: z.array(NewColumnSchema),
    rows: z.array(NewRowSchema),
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
      const { table: _, ...rest } = now
      const next = replaceShapePushing(ctx.catalog, book, args.page, args.item, () => rest)
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
    // 軸は新しい表に合わせる（無くなった列の軸を外し、グラフで軸が無ければ既定の列を選ぶ）
    const props = settleAxes(now.props, table.data)
    // 表の見た目なら、表と文字の領域が全部見える大きさ（紙の端で止める）に合わせる。合わせて置けなければ、大きさはそのまま
    const paper = paperSize(ctx.catalog, page)
    const onPage = page.items?.some(i => i.id === args.item) ?? false
    const room = paper && (onPage ? { w: paper.w - now.x, h: paper.h - now.y } : paper)
    const fitted = now.props.view === "table" && room ? fitTable(table.data, props, room) : null
    const next =
      (fitted &&
        replaceShapePushing(ctx.catalog, book, args.page, args.item, () => ({
          ...now,
          ...fitted,
          props,
          table: table.data,
        }))) ??
      replaceShapePushing(ctx.catalog, book, args.page, args.item, () => ({ ...now, props, table: table.data }))
    return (
      next && {
        next,
        result: { columns: table.data.columns.map(c => c.id), rows: table.data.rows.map(r => r.id) },
      }
    )
  },
})

// リストの行のアクション: 行を足す・変える・消す・チェックする・高さ（本文を見せる行数）を書き換える・動かす（並べ替えと、同じページの別のリストへ）。行の中身の形は RowPropsSchema（書かなかった項目は既定）

import { z } from "zod"
import { hasPages, nextItemId, textNew, textPatch } from "../../../plugin-api"
import { kit } from "./kit"
import { ROW_ITEM, type RowProps, RowPropsSchema } from "./list"
import { findList, rowsOf, withList, withRowLines } from "./rows"
import { MAX_ROW_LINES } from "./size"

// 行の項目を変えるときに渡す形: 書いた項目だけを変え、null は消す（既定に戻す）。AI にもこの形で見せる。
// チェック（checked）は row-check、行数（lines）は row-lines で変える
const RowPatchSchema = z.strictObject(textPatch())

// 足す行の項目（書かなかった項目は既定）
const RowNewSchema = z.strictObject(textNew())

// リスト list の最後に行を足す
// 行のアクションは、リストを置けるタイプについて来る
const ON_LISTS = { items: [kit.name("shape-list")] }

export const ROW_ADD = kit.defineAction({
  id: "row-add",
  attach: ON_LISTS,
  aiDescription:
    "Add a row at the end of a list (an item @matomezu/list:shape-list). A row has a caption, a divider between the caption and the body (rule), a body and alignments. Returns the new row's id. read_book shows a list's rows in its children, in order, with their checks.",
  title: "Add row",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    list: z.string().min(1),
    props: RowNewSchema.optional(),
  }),
  run: (book, args, ctx) => {
    if (!hasPages(book)) return null
    const found = findList(book, args.page, args.list)
    const props = RowPropsSchema.safeParse(args.props ?? {})
    if (!found || !props.success) return null
    const row = { id: nextItemId(book, ctx.newId), item: ROW_ITEM, props: props.data }
    const next = withList(book, found.page, { ...found.list, children: [...rowsOf(found.list), row] })
    return { next, result: { row: row.id } }
  },
})

// 行の項目を変える。props に書いた項目だけを変え、null を書いた項目は消す（既定に戻す）。項目の形に合わなければ断る
export const ROW_UPDATE = kit.defineAction({
  id: "row-update",
  attach: ON_LISTS,
  aiDescription:
    "Change some props of a list's row. Props not given stay; a prop given as null is removed (back to its default).",
  title: "Update row",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    list: z.string().min(1),
    row: z.string().min(1),
    props: RowPatchSchema,
  }),
  run: (book, args) => {
    if (!hasPages(book)) return null
    const found = findList(book, args.page, args.list)
    const now = found && rowsOf(found.list).find(r => r.id === args.row)
    if (!found || !now) return null
    const merged = Object.fromEntries(Object.entries({ ...now.props, ...args.props }).filter(([, v]) => v !== null))
    const props = RowPropsSchema.safeParse(merged)
    if (!props.success) return null
    const children = rowsOf(found.list).map(r => (r.id === args.row ? { ...r, props: props.data } : r))
    return { next: withList(book, found.page, { ...found.list, children }), result: {} }
  },
})

// 行を消す。無い行を含むなら断る
export const ROW_REMOVE = kit.defineAction({
  id: "row-remove",
  attach: ON_LISTS,
  aiDescription: "Remove rows from a list.",
  title: "Remove rows",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    list: z.string().min(1),
    rows: z.array(z.string().min(1)).min(1),
  }),
  run: (book, args) => {
    if (!hasPages(book)) return null
    const found = findList(book, args.page, args.list)
    const rows = found ? rowsOf(found.list) : []
    if (!found || !args.rows.every(id => rows.some(r => r.id === id))) return null
    const children = rows.filter(r => !args.rows.includes(r.id))
    return { next: withList(book, found.page, { ...found.list, children }), result: {} }
  },
})

// 行のチェックを入れる・外す（チェックリストのリストだけ）
export const ROW_CHECK = kit.defineAction({
  id: "row-check",
  attach: ON_LISTS,
  aiDescription:
    "Check or uncheck a row of a list that is a checklist (its checklist prop is true; set it with @matomezu/paper:item-update, and setting it false removes every row's check). The user checks rows too, so a check can carry their answer.",
  title: "Check row",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    list: z.string().min(1),
    row: z.string().min(1),
    checked: z.boolean(),
  }),
  run: (book, args) => {
    if (!hasPages(book)) return null
    const found = findList(book, args.page, args.list)
    if (!found?.list.props.checklist || !rowsOf(found.list).some(r => r.id === args.row)) return null
    const children = rowsOf(found.list).map(r =>
      r.id === args.row ? { ...r, props: { ...r.props, checked: args.checked } } : r,
    )
    return { next: withList(book, found.page, { ...found.list, children }), result: {} }
  },
})

// 行の高さ（本文を見せる行数）を書き換える。rows が無ければ全部の行。lines は size.ts の RowsLines: 行数（同じ高さ）、"max"（本文の一番長い行に）、
// "fit"（行ごとにその行の本文が全部見える高さ）、null（行数を消し、リストでそろえる高さに戻す）。無い行を含むなら断る
export const ROW_LINES = kit.defineAction({
  id: "row-lines",
  attach: ON_LISTS,
  aiDescription:
    'Set how many body lines rows of a list show (rows given, or every row): a number gives them all that height whatever their body; "max" gives them all the height of the longest body; "fit" gives each row the height of its own body. null removes it: rows without it share the height of the most body lines among them, up to 5, and a longer body is cut with ….',
  title: "Set row heights",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    list: z.string().min(1),
    rows: z.array(z.string().min(1)).min(1).optional(),
    lines: z.union([z.number().int().min(0).max(MAX_ROW_LINES), z.literal("max"), z.literal("fit")]).nullable(),
  }),
  run: (book, args) => {
    if (!hasPages(book)) return null
    const found = findList(book, args.page, args.list)
    const rows = found ? rowsOf(found.list) : []
    if (!found || !(args.rows ?? []).every(id => rows.some(r => r.id === id))) return null
    return { next: withList(book, found.page, withRowLines(found.list, args.lines, args.rows)), result: {} }
  },
})

// 行を動かす: 同じページのリスト to（無ければ同じリスト）の、行 before の前（無ければ最後）へ。
// 移した先がチェックリストでなければ、行のチェックを消す。無いリスト・無い行・自分の前へなら断る
export const ROW_MOVE = kit.defineAction({
  id: "row-move",
  attach: ON_LISTS,
  aiDescription:
    "Move a row of a list before the row before (or to the end without it), in the same list or in another list (to) on the same page. A row moved to a list that is not a checklist loses its check.",
  title: "Move row",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    list: z.string().min(1),
    row: z.string().min(1),
    to: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  }),
  run: (book, args) => {
    if (!hasPages(book)) return null
    const from = findList(book, args.page, args.list)
    const moving = from && rowsOf(from.list).find(r => r.id === args.row)
    if (!from || !moving || args.before === args.row) return null
    const rest = rowsOf(from.list).filter(r => r.id !== args.row)
    const left = withList(book, from.page, { ...from.list, children: rest })
    const to = findList(left, args.page, args.to ?? args.list)
    if (!to) return null
    const target = rowsOf(to.list)
    const at = args.before === undefined ? target.length : target.findIndex(r => r.id === args.before)
    if (at < 0) return null
    const { checked, ...plain } = moving.props
    const row = to.list.props.checklist || checked === undefined ? moving : { ...moving, props: plain as RowProps }
    const children = [...target.slice(0, at), row, ...target.slice(at)]
    return { next: withList(left, to.page, { ...to.list, children }), result: {} }
  },
})

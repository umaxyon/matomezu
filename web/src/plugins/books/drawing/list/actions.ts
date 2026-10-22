// リストの行のアクション: 行を足す・変える・消す・チェックする・高さ（本文を見せる行数）を書き換える。行の中身の形は RowPropsSchema（書かなかった項目は既定）
import { z } from "zod"
import { defineAction } from "../../../../core/def/action"
import { AlignSchema } from "../box"
import { BOX_BODY_MAX } from "../box/size"
import { nextItemId } from "../items/items"
import { ROW_ITEM, type RowProps, RowPropsSchema } from "."
import { findList, rowsOf, withList } from "./rows"
import { MAX_ROW_LINES } from "./size"

// 行の項目を変えるときに渡す形: 書いた項目だけを変え、null は消す（既定に戻す）。AI にもこの形で見せる。
// チェック（checked）は row.check、行数（lines）は row.lines で変える
const RowPatchSchema = z.strictObject({
  caption: z.string().nullable().optional(),
  rule: z.boolean().nullable().optional(), // キャプションと本文の間の区切り線
  body: z.string().max(BOX_BODY_MAX).nullable().optional(),
  captionAlign: AlignSchema.nullable().optional(),
  bodyAlign: AlignSchema.nullable().optional(),
})

// 足す行の項目（書かなかった項目は既定）
const RowNewSchema = RowPatchSchema.extend({
  caption: z.string().optional(),
  rule: z.boolean().optional(),
  body: z.string().max(BOX_BODY_MAX).optional(),
  captionAlign: AlignSchema.optional(),
  bodyAlign: AlignSchema.optional(),
})

// リスト list の最後に行を足す
export const ROW_ADD = defineAction({
  id: "row.add",
  title: "Add row",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    list: z.string().min(1),
    props: RowNewSchema.optional(),
  }),
  run: (book, args, ctx) => {
    if (book.type !== "drawing") return null
    const found = findList(book, args.page, args.list)
    const props = RowPropsSchema.safeParse(args.props ?? {})
    if (!found || !props.success) return null
    const row = { id: nextItemId(book, ctx.newId), item: ROW_ITEM, props: props.data }
    const next = withList(book, found.page, { ...found.list, children: [...rowsOf(found.list), row] })
    return { next, result: { row: row.id } }
  },
})

// 行の項目を変える。props に書いた項目だけを変え、null を書いた項目は消す（既定に戻す）。項目の形に合わなければ断る
export const ROW_UPDATE = defineAction({
  id: "row.update",
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
    if (book.type !== "drawing") return null
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
export const ROW_REMOVE = defineAction({
  id: "row.remove",
  title: "Remove rows",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    list: z.string().min(1),
    rows: z.array(z.string().min(1)).min(1),
  }),
  run: (book, args) => {
    if (book.type !== "drawing") return null
    const found = findList(book, args.page, args.list)
    const rows = found ? rowsOf(found.list) : []
    if (!found || !args.rows.every(id => rows.some(r => r.id === id))) return null
    const children = rows.filter(r => !args.rows.includes(r.id))
    return { next: withList(book, found.page, { ...found.list, children }), result: {} }
  },
})

// 行のチェックを入れる・外す（チェックリストのリストだけ）
export const ROW_CHECK = defineAction({
  id: "row.check",
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
    if (book.type !== "drawing") return null
    const found = findList(book, args.page, args.list)
    if (!found?.list.props.checklist || !rowsOf(found.list).some(r => r.id === args.row)) return null
    const children = rowsOf(found.list).map(r =>
      r.id === args.row ? { ...r, props: { ...r.props, checked: args.checked } } : r,
    )
    return { next: withList(book, found.page, { ...found.list, children }), result: {} }
  },
})

// 行の高さ（本文を見せる行数）を書き換える。rows が無ければ全部の行。lines が null なら行数を消し、リストでそろえる高さに戻す。無い行を含むなら断る
export const ROW_LINES = defineAction({
  id: "row.lines",
  title: "Set row heights",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    list: z.string().min(1),
    rows: z.array(z.string().min(1)).min(1).optional(),
    lines: z.number().int().min(0).max(MAX_ROW_LINES).nullable(),
  }),
  run: (book, args) => {
    if (book.type !== "drawing") return null
    const found = findList(book, args.page, args.list)
    const rows = found ? rowsOf(found.list) : []
    if (!found || !(args.rows ?? []).every(id => rows.some(r => r.id === id))) return null
    const targets = new Set(args.rows ?? rows.map(r => r.id))
    const children = rows.map(r => {
      if (!targets.has(r.id)) return r
      const { lines: _, ...rest } = r.props
      return { ...r, props: (args.lines === null ? rest : { ...rest, lines: args.lines }) as RowProps }
    })
    return { next: withList(book, found.page, { ...found.list, children }), result: {} }
  },
})

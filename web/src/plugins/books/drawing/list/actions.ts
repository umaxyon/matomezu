// リストの行のアクション: 行を足す・変える・消す・チェックする。行の中身の形は RowPropsSchema（書かなかった項目は既定）
import { z } from "zod"
import { defineAction } from "../../../../core/def/action"
import { nextItemId } from "../items/items"
import { ROW_ITEM, RowPropsSchema } from "."
import { findList, rowsOf, withList } from "./rows"

// リスト list の最後に行を足す。チェックリストでないリストの行にチェックは書けない
export const ROW_ADD = defineAction({
  id: "row.add",
  title: "Add row",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    list: z.string().min(1),
    props: z.record(z.string(), z.unknown()).optional(),
  }),
  run: (book, args, ctx) => {
    if (book.type !== "drawing") return null
    const found = findList(book, args.page, args.list)
    const props = RowPropsSchema.safeParse(args.props ?? {})
    if (!found || !props.success || (props.data.checked !== undefined && !found.list.props.checklist)) return null
    const row = { id: nextItemId(book, ctx.newId), item: ROW_ITEM, props: props.data }
    const next = withList(book, found.page, { ...found.list, children: [...rowsOf(found.list), row] })
    return { next, result: { row: row.id } }
  },
})

// 行の項目を変える。props に書いた項目だけを変え、null を書いた項目は消す（既定に戻す）。項目の形に合わない・チェックリストでないリストのチェックは断る
export const ROW_UPDATE = defineAction({
  id: "row.update",
  title: "Update row",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    list: z.string().min(1),
    row: z.string().min(1),
    props: z.record(z.string(), z.unknown()),
  }),
  run: (book, args) => {
    if (book.type !== "drawing") return null
    const found = findList(book, args.page, args.list)
    const now = found && rowsOf(found.list).find(r => r.id === args.row)
    if (!found || !now) return null
    const merged = Object.fromEntries(Object.entries({ ...now.props, ...args.props }).filter(([, v]) => v !== null))
    const props = RowPropsSchema.safeParse(merged)
    if (!props.success || (props.data.checked !== undefined && !found.list.props.checklist)) return null
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

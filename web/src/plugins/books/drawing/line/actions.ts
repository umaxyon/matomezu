// 線のアクション: 線を引く・項目を変える。消すのは item.remove（形を消すと、つながる線も消える）
import { z } from "zod"
import { defineAction } from "../../../../core/def/action"
import type { Registry } from "../../../../core/registry"
import type { BookOf } from "../../../../core/schema/book"
import { keepApart, nextItemId, rectsOf } from "../items/items"
import { type DrawingPage, linesOf, shapesOf } from "../placed"
import { LINE, LinePatchSchema } from "."
import { canConnect, DEFAULT_ROUTE, type PlacedLine, PlacedLineSchema, tidyLines } from "./placed"

type Drawing = BookOf<"drawing">

// ページの、線をつなげる形（connectable）か
function connectable(reg: Registry, page: DrawingPage, id: string): boolean {
  const shape = shapesOf(page).find(s => s.id === id)
  return !!shape && (reg.items.get(shape.item)?.capabilities.includes("connectable") ?? false)
}

// 手で直した途中の区間（via）が、今の形の位置で引けるか（無ければ引ける）
const viaDrawn = (reg: Registry, page: DrawingPage, line: PlacedLine): boolean =>
  !line.props.via || tidyLines([line], rectsOf(reg, page), DEFAULT_ROUTE === "elbow")[0]?.props.via !== undefined

// ページの線 line を置き換え（無ければ最後に足し）、線でつながった 2 つの形が間隔の下限より近ければ、始点の形はそのままで終点の側をどける
function withLine(reg: Registry, book: Drawing, page: DrawingPage, line: PlacedLine): Drawing | null {
  const items = page.items ?? []
  const next = items.some(i => i.id === line.id) ? items.map(i => (i.id === line.id ? line : i)) : [...items, line]
  const changed = { ...book, pages: book.pages.map(p => (p.id === page.id ? { ...page, items: next } : p)) }
  return keepApart(reg, changed, page.id, line.from, line.to)
}

// 形 from から to へ線を引く（同じ形なら自分に戻る線）。両端は同じページのつなげる形（箱・リスト。リストの行にはつながない）。
// 同じ組（向きは問わない）には 1 本だけ、自分に戻る線は何本でも。props は線の項目（書かなかった項目は既定）。
// 線でつながった 2 つの形は間隔の下限が広がる（32px、キャプションがあれば 40px）ので、近すぎれば終点の側をどける。どけられなければ断る
export const LINE_CONNECT = defineAction({
  id: "line.connect",
  title: "Connect items",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    props: LINE.props.optional(),
  }),
  run: (book, args, ctx) => {
    if (book.type !== "drawing") return null
    const page = book.pages.find(p => p.id === args.page)
    if (!page || !connectable(ctx.registry, page, args.from) || !connectable(ctx.registry, page, args.to)) return null
    if (!canConnect(linesOf(page), args.from, args.to)) return null
    const line = PlacedLineSchema.safeParse({
      id: nextItemId(book, ctx.newId),
      item: LINE.id,
      from: args.from,
      to: args.to,
      props: args.props ?? {},
    })
    if (!line.success || !viaDrawn(ctx.registry, page, line.data)) return null
    const next = withLine(ctx.registry, book, page, line.data)
    return next && { next, result: { line: line.data.id } }
  },
})

// 線の項目を変える。props に書いた項目だけを変え、null を書いた項目は消す（既定に戻す）。
// 手で直した途中の区間（via）は、両端が固定で、引けるときだけ書ける。キャプションを付けて間隔の下限が広がれば、終点の側をどける
export const LINE_UPDATE = defineAction({
  id: "line.update",
  title: "Update line",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    line: z.string().min(1),
    props: LinePatchSchema,
  }),
  run: (book, args, ctx) => {
    if (book.type !== "drawing") return null
    const page = book.pages.find(p => p.id === args.page)
    const now = page && linesOf(page).find(l => l.id === args.line)
    if (!page || !now) return null
    const props = Object.fromEntries(Object.entries({ ...now.props, ...args.props }).filter(([, v]) => v !== null))
    const line = PlacedLineSchema.safeParse({ ...now, props })
    if (!line.success || !viaDrawn(ctx.registry, page, line.data)) return null
    const next = withLine(ctx.registry, book, page, line.data)
    return next && { next, result: {} }
  },
})

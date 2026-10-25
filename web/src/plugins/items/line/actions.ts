// 線のアクション: 線を引く・項目を変える・端をつなぎ替える。消すのは item.remove（形を消すと、つながる線も消える）

import { z } from "zod"
import { hasPages, type PagedBook } from "../../../core/book"
import type { CoreCatalog } from "../../../core/core-catalog"
import { defineAction } from "../../../core/def/action"
import { keepApart, nextItemId } from "../../../core/place/items"
import { connectorSchema, type ItemPage, pageItemsOf, rectsOf } from "../../../core/placed"
import { connectable } from "./connect"
import { elbowAt, LINE, LinePatchSchema, usesLines } from "./line"
import { canConnect, linesOf, type PlacedLine, tidyLines } from "./placed"

type Drawing = PagedBook

// 置いた線のデータの形
const PlacedLineSchema = connectorSchema(LINE) as unknown as z.ZodType<PlacedLine>

// 線を今の形の位置で整えたもの: 手で直した途中の区間（via）が引けなければ消す（両端が固定でない・直線・形の位置で引けない）
const tidied = (reg: CoreCatalog, book: Drawing, page: ItemPage, line: PlacedLine): PlacedLine =>
  tidyLines([line], rectsOf(reg, page), elbowAt(reg, book, page))[0] ?? line

// 手で直した途中の区間（via）が、今の形の位置で引けるか（無ければ引ける）
const viaDrawn = (reg: CoreCatalog, book: Drawing, page: ItemPage, line: PlacedLine): boolean =>
  !line.props.via || tidied(reg, book, page, line).props.via !== undefined

// ページの線 line を置き換え（無ければ最後に足し）、線でつながった 2 つの形が間隔の下限より近ければ、stay の形（無ければ始点）はそのままでもう一方をどける
function withLine(reg: CoreCatalog, book: Drawing, page: ItemPage, line: PlacedLine, stay = line.from): Drawing | null {
  const items = pageItemsOf(page)
  const next = items.some(i => i.id === line.id) ? items.map(i => (i.id === line.id ? line : i)) : [...items, line]
  const changed = { ...book, pages: book.pages.map(p => (p.id === page.id ? { ...page, items: next } : p)) }
  return keepApart(reg, changed, page.id, stay, stay === line.from ? line.to : line.from)
}

// 形 from から to へ線を引く（同じ形なら自分に戻る線）。両端は同じページのつなげる形（箱・リスト。リストの行にはつながない）。
// 線が使えるブック（usesLines）だけ。同じ組（向きは問わない）には 1 本だけ、自分に戻る線は何本でも。props は線の項目（書かなかった項目は既定）。
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
    if (!hasPages(book) || !usesLines(ctx.registry, book)) return null
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
    if (!line.success || !viaDrawn(ctx.registry, book, page, line.data)) return null
    const next = withLine(ctx.registry, book, page, line.data)
    return next && { next, result: { line: line.data.id } }
  },
})

// 線の項目を変える。props に書いた項目だけを変え、null を書いた項目は消す（既定に戻す）。
// 手で直した途中の区間（via）は、両端が固定で、引けるときだけ書ける（書いて引けなければ断る）。
// ほかの項目を変えて（直線にした・端を自由に戻した・端を別の辺へ動かした）今の via が引けなくなれば、via を消す。
// キャプションを付けて間隔の下限が広がれば、終点の側をどける
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
    if (!hasPages(book)) return null
    const page = book.pages.find(p => p.id === args.page)
    const now = page && linesOf(page).find(l => l.id === args.line)
    if (!page || !now) return null
    const props = Object.fromEntries(Object.entries({ ...now.props, ...args.props }).filter(([, v]) => v !== null))
    const line = PlacedLineSchema.safeParse({ ...now, props })
    if (!line.success) return null
    if (args.props.via != null && !viaDrawn(ctx.registry, book, page, line.data)) return null
    const next = withLine(ctx.registry, book, page, tidied(ctx.registry, book, page, line.data))
    return next && { next, result: {} }
  },
})

// 線の端 end（始点 from か終点 to）を形 item へつなぎ替える。キャプション・端の形・線の種類・通り方はそのまま。
// 手で直した途中の区間とつなぎ替えた端の位置は捨て、自分に戻る線になる・でなくなるときは両端の位置を捨てる（意味が変わるため）。
// props の exitAt・enterAt を書けば、その位置に固定する。つなぎ替えられる相手は線を引くときと同じ決まり（もう一方の端との組にほかの線が無い）。
// つなぎ替えた先の形はそのままで、近すぎればもう一方の形をどける
export const LINE_RECONNECT = defineAction({
  id: "line.reconnect",
  title: "Reconnect line",
  target: "book",
  needs: [],
  args: z.strictObject({
    page: z.string().min(1),
    line: z.string().min(1),
    end: z.enum(["from", "to"]),
    item: z.string().min(1),
    props: z.strictObject({ exitAt: LINE.props.shape.exitAt, enterAt: LINE.props.shape.enterAt }).optional(),
  }),
  run: (book, args, ctx) => {
    if (!hasPages(book) || !usesLines(ctx.registry, book)) return null
    const page = book.pages.find(p => p.id === args.page)
    const now = page && linesOf(page).find(l => l.id === args.line)
    if (!page || !now || now[args.end] === args.item || !connectable(ctx.registry, page, args.item)) return null
    const other = args.end === "from" ? now.to : now.from
    if (
      !canConnect(
        linesOf(page).filter(l => l.id !== now.id),
        other,
        args.item,
      )
    )
      return null
    const moved = { ...now, [args.end]: args.item }
    const loopChanged = (now.from === now.to) !== (moved.from === moved.to)
    const { via: _, ...props } = now.props
    if (loopChanged || args.end === "from") delete props.exitAt
    if (loopChanged || args.end === "to") delete props.enterAt
    const line = PlacedLineSchema.safeParse({ ...moved, props: { ...props, ...args.props } })
    if (!line.success) return null
    const next = withLine(ctx.registry, book, page, line.data, args.item)
    return next && { next, result: {} }
  },
})

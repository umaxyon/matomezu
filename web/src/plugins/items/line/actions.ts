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
const tidied = (catalog: CoreCatalog, book: Drawing, page: ItemPage, line: PlacedLine): PlacedLine =>
  tidyLines([line], rectsOf(catalog, page), elbowAt(catalog, book, page))[0] ?? line

// 手で直した途中の区間（via）が、今の形の位置で引けるか（無ければ引ける）
const viaDrawn = (catalog: CoreCatalog, book: Drawing, page: ItemPage, line: PlacedLine): boolean =>
  !line.props.via || tidied(catalog, book, page, line).props.via !== undefined

// ページの線 line を置き換え（無ければ最後に足し）、線でつながった 2 つの形が間隔の下限より近ければ、stay の形（無ければ始点）はそのままでもう一方をどける
function withLine(
  catalog: CoreCatalog,
  book: Drawing,
  page: ItemPage,
  line: PlacedLine,
  stay = line.from,
): Drawing | null {
  const items = pageItemsOf(page)
  const next = items.some(i => i.id === line.id) ? items.map(i => (i.id === line.id ? line : i)) : [...items, line]
  const changed = { ...book, pages: book.pages.map(p => (p.id === page.id ? { ...page, items: next } : p)) }
  return keepApart(catalog, changed, page.id, stay, stay === line.from ? line.to : line.from)
}

// 形 from から to へ線を引く（同じ形なら自分に戻る線）。両端は同じページのつなげる形（箱・リスト。リストの行にはつながない）。
// 線が使えるブック（usesLines）だけ。同じ組（向きは問わない）には 1 本だけ、自分に戻る線は何本でも。props は線の項目（書かなかった項目は既定）。
// 線でつながった 2 つの形は間隔の下限が広がる（32px、キャプションがあれば 40px）ので、近すぎれば終点の側をどける。どけられなければ断る
export const LINE_CONNECT = defineAction({
  id: "line.connect",
  aiDescription:
    "Draw a line from the item from to the item to (boxes and lists on the same page, not a list's rows); from and to the same item draws a line looping back to it. Two items are joined by one line at most (either way); an item may loop back to itself any number of times. route is straight or elbow (without it, elbow); startHead and endHead put a shape on that end (arrow is a filled triangle); dash is solid or dashed. exitAt and enterAt fix where the line leaves from and enters to: a fraction (0 to 1) of the way clockwise round the item's edge from its top-left corner; without them the line picks its ends. via (elbow lines with both ends fixed) places the line's middle segments. If the two items are now too close (32 pixels, 40 with a caption), to is moved away. Returns the new line's id. read_book shows lines among a page's items.",
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
    if (!hasPages(book) || !usesLines(ctx.catalog, book)) return null
    const page = book.pages.find(p => p.id === args.page)
    if (!page || !connectable(ctx.catalog, page, args.from) || !connectable(ctx.catalog, page, args.to)) return null
    if (!canConnect(linesOf(page), args.from, args.to)) return null
    const line = PlacedLineSchema.safeParse({
      id: nextItemId(book, ctx.newId),
      item: LINE.id,
      from: args.from,
      to: args.to,
      props: args.props ?? {},
    })
    if (!line.success || !viaDrawn(ctx.catalog, book, page, line.data)) return null
    const next = withLine(ctx.catalog, book, page, line.data)
    return next && { next, result: { line: line.data.id } }
  },
})

// 線の項目を変える。props に書いた項目だけを変え、null を書いた項目は消す（既定に戻す）。
// 手で直した途中の区間（via）は、両端が固定で、引けるときだけ書ける（書いて引けなければ断る）。
// ほかの項目を変えて（直線にした・端を自由に戻した・端を別の辺へ動かした）今の via が引けなくなれば、via を消す。
// キャプションを付けて間隔の下限が広がれば、終点の側をどける
export const LINE_UPDATE = defineAction({
  id: "line.update",
  aiDescription:
    "Change some props of a line. Props not given stay; a prop given as null is removed (back to its default). A caption that widens the gap moves the end item away.",
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
    if (args.props.via != null && !viaDrawn(ctx.catalog, book, page, line.data)) return null
    const next = withLine(ctx.catalog, book, page, tidied(ctx.catalog, book, page, line.data))
    return next && { next, result: {} }
  },
})

// 線の端 end（始点 from か終点 to）を形 item へつなぎ替える。キャプション・端の形・線の種類・通り方はそのまま。
// 手で直した途中の区間とつなぎ替えた端の位置は捨て、自分に戻る線になる・でなくなるときは両端の位置を捨てる（意味が変わるため）。
// props の exitAt・enterAt を書けば、その位置に固定する。つなぎ替えられる相手は線を引くときと同じ決まり（もう一方の端との組にほかの線が無い）。
// つなぎ替えた先の形はそのままで、近すぎればもう一方の形をどける
export const LINE_RECONNECT = defineAction({
  id: "line.reconnect",
  aiDescription:
    "Move one end of a line (end is from or to) to another item on the page, keeping its caption, heads, style and route. Its hand-placed middle segments and the moved end's fixed place are dropped (both ends' places when it becomes or stops being a loop); props.exitAt or props.enterAt fix them again. The item and the other end must not be joined by another line. If they are now too close, the other end's item is moved away.",
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
    if (!hasPages(book) || !usesLines(ctx.catalog, book)) return null
    const page = book.pages.find(p => p.id === args.page)
    const now = page && linesOf(page).find(l => l.id === args.line)
    if (!page || !now || now[args.end] === args.item || !connectable(ctx.catalog, page, args.item)) return null
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
    const next = withLine(ctx.catalog, book, page, line.data, args.item)
    return next && { next, result: {} }
  },
})

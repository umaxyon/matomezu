// 図面のブック: ページを持ち、ページごとに紙を置き、紙の上にアイテム（形と、形どうしを結ぶ線）を置く。見た目（テーマと紙の色）を変えられる
import { z } from "zod"
import { defineBookType } from "../../../core/def/book-type"
import { BookLookSchema } from "../../../core/theme"
import { PAPER_IDS } from "../../base"
import { rectsOf } from "./items/items"
import { ROUTES } from "./line"
import { DrawingPageSchema, drawingHolds, elbowOf, tidyPage } from "./placed"

export const DRAWING = defineBookType({
  id: "drawing",
  version: 1,
  title: "Drawing",
  schema: z.strictObject({
    type: z.literal("drawing"),
    id: z.string().min(1),
    title: z.string(),
    pages: z.array(DrawingPageSchema),
    lineRoute: z.enum(ROUTES).optional(), // ブックの線の既定の通り方（ページが自分の既定を持たなければこれ。無ければ折れ線）
    ...BookLookSchema,
  }),
  single: false,
  create: init => ({ type: "drawing", ...init, pages: [] }),
  pages: {
    paper: { allowed: PAPER_IDS, default: "a4", orientation: "landscape", perPage: true },
    addFromTabs: true,
  },
  items: {
    allowed: ["shape.box", "shape.list", "connector.line"],
    defaults: ["shape.box", "shape.list", "connector.line"],
  },
  actions: {
    allowed: [
      "page.add",
      "book.update",
      "item.place",
      "item.move",
      "item.update",
      "item.resize",
      "item.remove",
      "row.add",
      "row.update",
      "row.remove",
      "row.check",
      "row.lines",
      "row.move",
      "line.connect",
      "line.update",
      "line.reconnect",
      "page.update",
    ],
    defaults: [
      "page.add",
      "book.update",
      "item.place",
      "item.move",
      "item.update",
      "item.resize",
      "item.remove",
      "row.add",
      "row.update",
      "row.remove",
      "row.check",
      "row.lines",
      "row.move",
      "line.connect",
      "line.update",
      "line.reconnect",
      "page.update",
    ],
  },
  theme: "standard",
  tokens: [],
  tools: "paper",
  holds: drawingHolds,
  // 設定の項目（土台の book.update・page.update が受け付ける）: 線の既定の通り方。変えたら、直線になって引けなくなった手で直した区間をどのページでも消す
  settings: {
    book: z.strictObject({ lineRoute: z.enum(ROUTES) }),
    page: z.strictObject({ lineRoute: z.enum(ROUTES) }),
    settle: (book, reg) => ({
      ...book,
      pages: book.pages.map(p => tidyPage(p, rectsOf(reg, p), elbowOf(book, p))),
    }),
  },
})

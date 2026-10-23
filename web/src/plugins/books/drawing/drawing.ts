// 図面のブック: ページを持ち、ページごとに紙を置き、紙の上にアイテム（形と、形どうしを結ぶ線）を置く。見た目（テーマと紙の色）を変えられる
import { z } from "zod"
import { defineBookType } from "../../../core/def/book-type"
import { BookLookSchema } from "../../../core/theme"
import { PAPER_IDS } from "../../base"
import { DrawingPageSchema, drawingHolds } from "./placed"

export const DRAWING = defineBookType({
  id: "drawing",
  version: 1,
  title: "Drawing",
  schema: z.strictObject({
    type: z.literal("drawing"),
    id: z.string().min(1),
    title: z.string(),
    pages: z.array(DrawingPageSchema),
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
    ],
  },
  theme: "standard",
  tokens: [],
  tools: "paper",
  holds: drawingHolds,
})

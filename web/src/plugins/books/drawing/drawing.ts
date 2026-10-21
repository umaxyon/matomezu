// 図面のブック: ページを持ち、ページごとに紙を置き、紙の上にアイテムを置く
import { z } from "zod"
import { defineBookType } from "../../../core/def/book-type"
import { PAPER_IDS } from "../../base"
import { DrawingPageSchema } from "./items/schema"

export const DRAWING = defineBookType({
  id: "drawing",
  version: 1,
  title: "Drawing",
  schema: z.strictObject({
    type: z.literal("drawing"),
    id: z.string().min(1),
    title: z.string(),
    pages: z.array(DrawingPageSchema),
  }),
  single: false,
  create: init => ({ type: "drawing", ...init, pages: [] }),
  pages: {
    paper: { allowed: PAPER_IDS, default: "a4", orientation: "landscape", perPage: true },
    addFromTabs: true,
  },
  items: { allowed: ["shape.box"], defaults: ["shape.box"] },
  actions: {
    allowed: ["page.add", "item.place", "item.move", "item.update"],
    defaults: ["page.add", "item.place", "item.move", "item.update"],
  },
  theme: "standard",
  tokens: [],
})

// 図面のブック: ページを持ち、ページごとに紙を置く
import { z } from "zod"
import { defineBookType } from "../../core/def/book-type"
import { PageSchema } from "../../core/schema/page"
import { PAPER_IDS } from "../base"

export const DRAWING = defineBookType({
  id: "drawing",
  version: 1,
  title: "Drawing",
  schema: z.strictObject({
    type: z.literal("drawing"),
    id: z.string().min(1),
    title: z.string(),
    pages: z.array(PageSchema),
  }),
  single: false,
  create: init => ({ type: "drawing", ...init, pages: [] }),
  pages: {
    paper: { allowed: PAPER_IDS, default: "a4", orientation: "landscape", perPage: true },
    addFromTabs: true,
  },
  items: { allowed: ["shape.box"], defaults: ["shape.box"] },
  actions: { allowed: ["page.add"], defaults: ["page.add"] },
  theme: "standard",
  tokens: [],
})

// 図面のブック: ページを持ち、ページごとに紙を置く
import { z } from "zod"
import { defineBookType } from "../def/book-type"
import { PAPER_IDS } from "../papers"
import { PageSchema } from "../schema/page"

export const DRAWING = defineBookType({
  id: "drawing",
  version: 1,
  title: "図面",
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

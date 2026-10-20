// 図面のブック: ページを持ち、ページに紙を置く
import { z } from "zod"
import { defineBookType } from "../def/book-type"
import { PageSchema } from "../schema/page"

export const DRAWING = defineBookType({
  id: "drawing",
  version: 1,
  title: "図面",
  schema: z.strictObject({
    type: z.literal("drawing"),
    id: z.string().min(1),
    title: z.string(),
    pages: z.array(PageSchema).min(1),
  }),
  single: false,
  pages: true,
  paper: "a4-landscape",
  items: { allowed: ["shape.box"], defaults: ["shape.box"] },
  actions: { allowed: ["page.add"], defaults: ["page.add"] },
  theme: "standard",
  tokens: [],
})

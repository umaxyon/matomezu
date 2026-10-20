// マスターのブック: ブックの一覧や設定などを集める、紙もページも無い画面。名前はタイプの名前で呼ぶ（題名を持たない）
import { z } from "zod"
import { defineBookType } from "../def/book-type"

export const MASTER = defineBookType({
  id: "master",
  version: 1,
  title: "マスター",
  schema: z.strictObject({
    type: z.literal("master"),
    id: z.string().min(1),
  }),
  single: true,
  pages: false,
  paper: null,
  items: { allowed: [], defaults: [] },
  actions: { allowed: [], defaults: [] },
  theme: "standard",
  tokens: [],
})

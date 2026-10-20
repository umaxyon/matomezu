// マスターのブック: ブックの一覧や設定などを集める、紙もページも無い画面。名前はタイプの名前で呼ぶ（題名を持たない）。
// app のホームにすると、ブックの一覧を変えるアクション（book.create など）を許すかは、このタイプが決める
import { z } from "zod"
import { defineBookType } from "../../core/def/book-type"

export const MASTER = defineBookType({
  id: "master",
  version: 1,
  title: "マスター",
  schema: z.strictObject({
    type: z.literal("master"),
    id: z.string().min(1),
  }),
  single: true,
  book: { type: "master", id: "master" },
  pages: null,
  items: { allowed: [], defaults: [] },
  actions: { allowed: ["book.create"], defaults: ["book.create"] },
  theme: "standard",
  tokens: [],
})

export const MASTER_BOOK = MASTER.book

// マスターのブック: ブックの一覧や設定などを集める、紙もページも無い画面。名前はタイプの名前で呼ぶ（題名を持たない）。
// app のホームにすると、ブックの一覧と設定を変えるアクション（book.create・settings.lang など）を許すかは、このタイプが決める
import { z } from "zod"
import { defineBookType } from "../../../core/def/book-type"
import { definePresentation } from "../../../core/def/presentation"

// マスターの見せ方: ブックの一覧などを並べる画面
export const MASTER_PRESENTATION = definePresentation({ id: "master" })

export const MASTER = defineBookType({
  id: "master",
  version: 1,
  title: "Master",
  schema: z.strictObject({
    type: z.literal("master"),
    id: z.string().min(1),
  }),
  single: true,
  book: { type: "master", id: "master" },
  pages: null,
  items: { allowed: [], defaults: [] },
  actions: {
    allowed: ["book.create", "settings.lang", "settings.skin", "settings.keys"],
    defaults: ["book.create", "settings.lang", "settings.skin", "settings.keys"],
  },
  theme: "standard",
  presentation: MASTER_PRESENTATION.id,
  tokens: [],
})

export const MASTER_BOOK = MASTER.book

// ツリーのブック: ページごとに紙を置く。紙に置けるアイテムは無い。見た目（テーマと紙の色）は base の設定の項目で変えられる
import { z } from "zod"
import { BOOK_PAPER_COLOR, BOOK_THEME, PAPER_IDS } from "../../base"
import { kit } from "./kit"

export const TREE = kit.defineBookType({
  id: "tree",
  version: 1,
  title: "Tree",
  schema: z.strictObject({ id: z.string().min(1) }),
  single: false,
  create: init => ({ ...init, pages: [] }),
  pages: {
    paper: { allowed: PAPER_IDS, default: "@matomezu/base:a4", orientation: "landscape", perPage: true },
    addFromTabs: true,
  },
  items: { allowed: [], defaults: [] },
  actions: {}, // 使うアクションは、選んだアイテム・見せ方・ページについて来る
  theme: "@matomezu/base:standard",
  presentation: "@matomezu/paper:paper",
  tokens: [],
  tools: "@matomezu/paper:paper",
  settings: { book: [BOOK_THEME.id, BOOK_PAPER_COLOR.id] },
})

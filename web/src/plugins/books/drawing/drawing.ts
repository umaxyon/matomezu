// 図面のブック: ページを持ち、ページごとに紙を置き、紙の上にアイテム（形と、形どうしを結ぶ線）を置く。見た目（テーマと紙の色）と文字の色は base の設定の項目で変えられる
import { z } from "zod"
import { BOOK_PAPER_COLOR, BOOK_TEXT_COLORS, BOOK_THEME, PAPER_IDS } from "../../base"
import { kit } from "./kit"

export const DRAWING = kit.defineBookType({
  id: "drawing",
  version: 1,
  title: "Drawing",
  schema: z.strictObject({ id: z.string().min(1) }),
  single: false,
  create: init => ({ ...init, pages: [] }),
  addPagesFromTabs: true,
  pages: {
    paper: { allowed: PAPER_IDS, default: "@matomezu/base:a4", orientation: "landscape", perPage: true },
  },
  items: {
    allowed: ["@matomezu/box:shape-nest-box", "@matomezu/list:shape-list", "@matomezu/line:connector-line"],
    defaults: ["@matomezu/box:shape-nest-box", "@matomezu/list:shape-list", "@matomezu/line:connector-line"],
  },
  actions: {}, // 使うアクションは、選んだアイテム・見せ方・ページについて来る

  theme: "@matomezu/base:standard",
  presentation: "@matomezu/paper:paper",
  tokens: [],
  tools: "@matomezu/paper:paper",
  // テーマ・紙の色・線の既定の通り方（ページは線の既定の通り方を持たなければブックの既定を継ぐ）
  settings: {
    book: [BOOK_THEME.id, BOOK_PAPER_COLOR.id, "@matomezu/line:line-route", BOOK_TEXT_COLORS.id],
    page: ["@matomezu/line:line-route"],
  },
})

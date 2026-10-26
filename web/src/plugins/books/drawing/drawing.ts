// 図面のブック: ページを持ち、ページごとに紙を置き、紙の上にアイテム（形と、形どうしを結ぶ線）を置く。見た目（テーマと紙の色）は base の設定の項目で変えられる
import { z } from "zod"
import { BOOK_PAPER_COLOR, BOOK_THEME, PAPER_IDS } from "../../base"
import { kit } from "./kit"

export const DRAWING = kit.defineBookType({
  id: "drawing",
  version: 1,
  title: "Drawing",
  schema: z.strictObject({ id: z.string().min(1) }),
  single: false,
  create: init => ({ ...init, pages: [] }),
  pages: {
    paper: { allowed: PAPER_IDS, default: "@matomezu/base:a4", orientation: "landscape", perPage: true },
    addFromTabs: true,
  },
  items: {
    allowed: ["@matomezu/box:shape-box", "@matomezu/list:shape-list", "@matomezu/line:connector-line"],
    defaults: ["@matomezu/box:shape-box", "@matomezu/list:shape-list", "@matomezu/line:connector-line"],
  },
  actions: {
    allowed: [
      "@matomezu/base:page-add",
      "@matomezu/base:book-update",
      "@matomezu/paper:item-place",
      "@matomezu/paper:item-move",
      "@matomezu/paper:item-update",
      "@matomezu/paper:item-resize",
      "@matomezu/paper:item-remove",
      "@matomezu/list:row-add",
      "@matomezu/list:row-update",
      "@matomezu/list:row-remove",
      "@matomezu/list:row-check",
      "@matomezu/list:row-lines",
      "@matomezu/list:row-move",
      "@matomezu/line:line-connect",
      "@matomezu/line:line-update",
      "@matomezu/line:line-reconnect",
      "@matomezu/base:page-update",
    ],
    defaults: [
      "@matomezu/base:page-add",
      "@matomezu/base:book-update",
      "@matomezu/paper:item-place",
      "@matomezu/paper:item-move",
      "@matomezu/paper:item-update",
      "@matomezu/paper:item-resize",
      "@matomezu/paper:item-remove",
      "@matomezu/list:row-add",
      "@matomezu/list:row-update",
      "@matomezu/list:row-remove",
      "@matomezu/list:row-check",
      "@matomezu/list:row-lines",
      "@matomezu/list:row-move",
      "@matomezu/line:line-connect",
      "@matomezu/line:line-update",
      "@matomezu/line:line-reconnect",
      "@matomezu/base:page-update",
    ],
  },
  theme: "@matomezu/base:standard",
  presentation: "@matomezu/paper:paper",
  tokens: [],
  tools: "paper",
  // テーマ・紙の色・線の既定の通り方（ページは線の既定の通り方を持たなければブックの既定を継ぐ）
  settings: {
    book: [BOOK_THEME.id, BOOK_PAPER_COLOR.id, "@matomezu/line:line-route"],
    page: ["@matomezu/line:line-route"],
  },
})

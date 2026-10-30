// 図面のブック: ページを持ち、ページごとに紙を置き、紙の上にアイテム（形と、形どうしを結ぶ線）を置く。見た目（テーマと紙の色）と文字の色は base の設定の項目で変えられる
import { z } from "zod"
import { BOOK_PAPER_COLOR, BOOK_TEXT_COLORS, BOOK_THEME, PAPER_IDS } from "../../base"
import { kit } from "./kit"

// ツールボックスに出す順: 内包ボックス・リスト・データ・シェイプ（シェイプパネルに並ぶ）、線
const ITEMS = [
  "@matomezu/box:shape-nest-box",
  "@matomezu/list:shape-list",
  "@matomezu/data:shape-data",
  "@matomezu/art:shape-person",
  "@matomezu/art:shape-db",
  "@matomezu/art:shape-server",
  "@matomezu/art:shape-pc",
  "@matomezu/art:shape-factory",
  "@matomezu/art:shape-document",
  "@matomezu/art:shape-trash",
  "@matomezu/art:shape-robot",
  "@matomezu/art:shape-cat",
  "@matomezu/art:shape-heart",
  "@matomezu/art:shape-bulb",
  "@matomezu/art:shape-dog",
  "@matomezu/art:shape-forest",
  "@matomezu/art:shape-house",
  "@matomezu/art:shape-family",
  "@matomezu/line:connector-line",
] as const

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
    allowed: ITEMS,
    defaults: ITEMS,
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

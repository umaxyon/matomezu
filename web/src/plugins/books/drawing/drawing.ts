// 図面のブック: ページを持ち、ページごとに紙を置き、紙の上にアイテム（形と、形どうしを結ぶ線）を置く。見た目（テーマと紙の色）と文字の色は base の設定の項目で変えられる
import { z } from "zod"
import {
  BACKGROUND_PRINT,
  PAGE_PAPER_COLOR,
  PAGE_TEXT_COLORS,
  PAGE_THEME,
  DIAGRAM_THEME_TYPE,
  PAPER_IDS,
  PRINT_PREVIEW_SETTINGS,
} from "../../base"
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
  "@matomezu/scrap:shape-scrap-box",
  "@matomezu/line:connector-line",
] as const

// 背景に置く形（ページの slide。背景編集モードで置く。スライドのアイテム）
const BACKGROUND_ITEMS = [
  "@matomezu/slide:slide-text",
  "@matomezu/slide:slide-free-line",
  "@matomezu/slide:slide-line",
  "@matomezu/slide:slide-ellipse",
] as const

export const DRAWING = kit.definePageType({
  id: "drawing",
  version: 1,
  title: "Drawing",
  schema: z.strictObject({ id: z.string().min(1) }),
  create: init => ({ ...init, pages: [] }),
  addPagesFromTabs: true,
  grow: { choices: ["right-down", "right", "down", "all"] }, // 可変ページの増やす向き（base の拡張ポイント）
  pages: {
    paper: {
      allowed: PAPER_IDS,
      default: "@matomezu/base:a4",
      orientation: "landscape",
      perPage: true,
    },
  },
  items: {
    allowed: ITEMS,
  },
  slide: { allowed: BACKGROUND_ITEMS, background: true },
  actions: {}, // 使うアクションは、選んだアイテム・見せ方・ページについて来る

  theme: "@matomezu/base:standard",
  themeTypes: [DIAGRAM_THEME_TYPE], // 使えるテーマのテーマタイプ
  presentation: "@matomezu/paper:paper",
  tokens: [],
  tools: "@matomezu/paper:paper",
  // テーマ・紙の色・線の既定の通り方（ページは線の既定の通り方を持たなければブックの既定を継ぐ）
  printCrossing: "ask", // 形は利用者が手で置くので、印刷区画をまたいだ形は印刷プレビューの前に直してもらう
  settings: {
    book: [
      PAGE_THEME.id,
      PAGE_PAPER_COLOR.id,
      "@matomezu/line:line-route",
      PAGE_TEXT_COLORS.id,
      ...PRINT_PREVIEW_SETTINGS,
      BACKGROUND_PRINT.id,
    ],
    page: ["@matomezu/line:line-route", BACKGROUND_PRINT.id],
  },
})

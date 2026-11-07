// ex8 のブックのタイプ「単語帳」: ページ 1 つがカードの束で、カードの文字はページのフィールド cards に持つ（置けるアイテムは無い）。
// 自分の見せ方（カード）を持ち、ステージに紙を置かずにビューがカードを並べる。ページは紙を持ち、印刷プレビューでは 1 ページを紙 1 枚に描く
import { BOOK_THEME, PAPER_IDS, PRINT_PREVIEW_SETTINGS, z } from "matomezu"
import { kit } from "./kit"

// 単語帳のテーマタイプ（自分で足す。単語帳はこれだけを使うので、選べるのは "all" のテーマと、黒板のテーマ）
export const CARD_THEMES = kit.name("cards")

// 黒板: 単語帳のテーマタイプのテーマ（図面などの、ほかのタイプのブックには出ない）
export const CHALK = kit.defineTheme({
  id: "chalk",
  title: "chalk",
  themeTypes: [CARD_THEMES],
  base: {
    surface: "#1f3b2d",
    paper: "#2b4c3a",
    "paper-line": "rgba(255, 255, 255, 0.15)",
    "paper-shadow": "rgba(0, 0, 0, 0.3)",
    text: "#f4f1e6",
    hint: "rgba(244, 241, 230, 0.6)",
    line: "#d8d3bf",
    fill: "#2b4c3a",
    accent: "#f2d16b",
  },
  palette: {
    primary: "#9cc8f2",
    secondary: "#d6b2f0",
    success: "#a8e0a0",
    warn: "#f2d16b",
    danger: "#f2a0a0",
    muted: "#c9c4b0",
  },
})

// カードの見せ方: ステージに紙を置かない（ビューが描く広さとスクロールを持つ）
export const CARDS = kit.definePresentation({ id: "cards", paper: false })

export const DECK = kit.defineBookType({
  id: "deck",
  version: 1,
  title: "deck",
  schema: z.strictObject({ id: z.string().min(1) }),
  single: false,
  create: init => ({ ...init, pages: [] }),
  addPagesFromTabs: true,
  pages: {
    paper: { allowed: PAPER_IDS, default: "@matomezu/base:a4", orientation: "portrait", perPage: true },
    fields: { cards: z.array(z.string()).describe("The cards' words, in order").optional() }, // 無ければカードは無い
  },
  items: { allowed: [] },
  actions: {},
  theme: "@matomezu/base:standard",
  themeTypes: [CARD_THEMES],
  presentation: CARDS.id,
  tokens: [],
  settings: { book: [BOOK_THEME.id, ...PRINT_PREVIEW_SETTINGS], page: [] },
})

// ex8 のブックのタイプ「単語帳」: ページ 1 つがカードの束で、カードの文字はページのフィールド cards に持つ（置けるアイテムは無い）。
// 自分の見せ方（カード）を持ち、ステージに紙を置かずにビューがカードを並べる。ページは紙を持ち、印刷プレビューでは 1 ページを紙 1 枚に描く
import { BOOK_THEME, PAPER_IDS, PRINT_PREVIEW_SETTINGS, z } from "matomezu"
import { kit } from "./kit"

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
  themeTypes: ["@matomezu/base:diagram"],
  presentation: CARDS.id,
  tokens: [],
  settings: { book: [BOOK_THEME.id, ...PRINT_PREVIEW_SETTINGS], page: [] },
})

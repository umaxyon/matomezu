// マークダウンのブック: ページ 1 つが文書 1 つで、原文はページのフィールド text に Markdown の文字列のまま持つ。紙に置けるアイテムは無い。
// 見せ方（markdown）はステージに紙を置かず、ビューが原文と描いた文書のペインを並べて、ふつうにスクロールする。ページは紙を持ち（印刷で紙に切るときの幅と高さ）、
// どのページもいつも可変ページで、下へ増やす。新しいページとページの設定のダイアログは base の物。道具は持たない。見た目（テーマと紙の色）は base の設定の項目で変えられる
import { z } from "zod"
import { BOOK_PAPER_COLOR, BOOK_THEME, PAPER_IDS } from "../../base"
import { kit } from "./kit"

// マークダウンの見せ方: ステージに紙を置かない
export const MARKDOWN_PRESENTATION = kit.definePresentation({ id: "markdown", paper: false })

// ビューが開く右クリックのメニュー: ペインのタブ（右クリックしたペインを受け取る）（ui.tsx で core/catalog.ts に書き足す）
export const PANE_CONTEXT = kit.name("pane-context")

export const MARKDOWN = kit.defineBookType({
  id: "markdown",
  version: 1,
  title: "Markdown",
  schema: z.strictObject({ id: z.string().min(1) }),
  single: false,
  create: init => ({ ...init, pages: [] }),
  addPagesFromTabs: true,
  grow: { always: { up: false, down: true, left: false, right: false } }, // いつも可変ページで、下へ増やす（base の拡張ポイント）
  pages: {
    paper: {
      allowed: PAPER_IDS,
      default: "@matomezu/base:a4",
      orientation: "portrait",
      perPage: true,
    },
    fields: { text: z.string().describe("The page's document, in Markdown").optional() }, // 無ければ空の文書
  },
  items: { allowed: [], defaults: [] },
  actions: {},
  theme: "@matomezu/base:standard",
  presentation: MARKDOWN_PRESENTATION.id,
  tokens: [],
  settings: {
    book: [BOOK_THEME.id, BOOK_PAPER_COLOR.id],
    page: [],
  },
})

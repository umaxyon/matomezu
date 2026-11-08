// スライドのブック: ページ 1 枚がスライド 1 枚で、中身はページの slide（スライドのアイテムの並び）だけで出来ている。箱や線などブックのアイテム（items）は置かない。
// スライドのアイテムは押し合わず、紙をはみ出てもよい（紙は表示の範囲で、スライドとして見せるときははみ出た所が切れる）。
// 見せ方は専用（slide）で、紙の見せ方（paper）の置く・動かす・大きさを変えるアクションは付かない
import { z } from "zod"
import { BOOK_PAPER_COLOR, BOOK_THEME, DIAGRAM_THEME_TYPE, PAPER_IDS, PRINT_PREVIEW_SETTINGS } from "../../base"
import { kit } from "./kit"

export const SLIDE_PRESENTATION = kit.definePresentation({ id: "slide" })

const SLIDE_ITEMS = [
  "@matomezu/slide:slide-text",
  "@matomezu/slide:slide-free-line",
  "@matomezu/slide:slide-line",
  "@matomezu/slide:slide-ellipse",
] as const

export const SLIDE_BOOK = kit.defineBookType({
  id: "slide",
  version: 1,
  title: "Slide",
  schema: z.strictObject({ id: z.string().min(1) }),
  single: false,
  create: init => ({ ...init, pages: [] }),
  addPagesFromTabs: true,
  pages: {
    paper: { allowed: PAPER_IDS, default: "@matomezu/base:a4", orientation: "landscape", perPage: true },
  },
  items: { allowed: [] },
  slide: { allowed: SLIDE_ITEMS },
  actions: {},
  theme: "@matomezu/base:standard",
  themeTypes: [DIAGRAM_THEME_TYPE],
  presentation: SLIDE_PRESENTATION.id,
  tokens: [],
  settings: {
    book: [BOOK_THEME.id, BOOK_PAPER_COLOR.id, ...PRINT_PREVIEW_SETTINGS],
    page: [],
  },
})

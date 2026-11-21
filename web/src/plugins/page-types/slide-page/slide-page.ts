// スライドのページのタイプ: ページ 1 枚がスライド 1 枚で、中身はページの slide（描画シェイプの並び）だけで出来ている。ページの items に置く箱や線などのアイテムは置かない。
// 描画シェイプは押し合わず、紙をはみ出てもよい（紙は表示の範囲で、スライドとして見せるときははみ出た所が切れる）。
// プレゼンテーションは専用（slide）で、紙のプレゼンテーション（paper）の置く・動かす・大きさを変えるアクションは付かない
import { DIAGRAM_THEME_TYPE, itemMinimapMarks, PAGE_PAPER_COLOR, PAGE_THEME, PAPER_IDS } from "../../base"
import { kit } from "./kit"
import { slidePrintSheets } from "./print"
import { SLIDE_PRINT } from "./print-setting"

export const SLIDE_PRESENTATION = kit.definePresentation({
  id: "slide",
  minimap: itemMinimapMarks, // ミニマップには、描画シェイプの絵を描く
  printSheets: slidePrintSheets, // 印刷区画は、紙 1 枚（描画シェイプが紙に掛かれば載っている）
})

const SLIDE_ITEMS = [
  "@matomezu/slide:slide-text",
  "@matomezu/slide:slide-free-line",
  "@matomezu/slide:slide-line",
  "@matomezu/slide:slide-ellipse",
  "@matomezu/slide:slide-rectangle",
] as const

export const SLIDE_PAGE = kit.definePageType({
  id: "slide",
  version: 1,
  title: "Slide",
  grouping: "binder", // スライドはいつもスライドのバインダに入る
  duplicatesPages: true, // 描画シェイプは id を指す項目を持たないので、ページを複製できる
  // 1 つのスライド（バインダ）の中は、紙と向きをそろえる
  paper: { allowed: PAPER_IDS, default: "@matomezu/base:ratio-16x9", orientation: "landscape" },
  items: { allowed: [] },
  slide: { allowed: SLIDE_ITEMS },
  actions: {},
  theme: "@matomezu/base:standard",
  themeTypes: [DIAGRAM_THEME_TYPE],
  presentation: SLIDE_PRESENTATION.id,
  tokens: [],
  settings: [PAGE_THEME.id, PAGE_PAPER_COLOR.id, SLIDE_PRINT.id],
})

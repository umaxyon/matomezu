// マークダウンのページのタイプ: ページ 1 つが文書 1 つで、原文はページのフィールド text に Markdown の文字列のまま持つ。紙に置けるアイテムは無い。
// プレゼンテーション（markdown）はステージに紙を置かず、ビューが原文と描いた文書のペインを並べて、ふつうにスクロールする。ページは紙を持ち（印刷で紙に切るときの幅と高さ）、
// どのページもいつも可変ページで、下へ増やす。新しいページとページの設定のダイアログは base の物。原文は base の page-update で、丸ごとか 1 か所の置き換えで変える。道具は持たない。見た目（テーマと紙の色）は base の設定の項目で変えられ、描いた文書の色・字の大きさ・余白はテーマで差し替える（tokens.ts）

import { z } from "zod"
import { DOCUMENT_THEME_TYPE, PAGE_PAPER_COLOR, PAGE_THEME, PAPER_IDS } from "../../base"
import { kit } from "./kit"
import { pageFieldsInput } from "./page-fields"
import { sourceEdit } from "./source-edit"
import { MARKDOWN_TOKENS } from "./tokens"

// マークダウンのプレゼンテーション: ステージに紙を置かない
// 印刷区画の数と切り方は、描いて測ってから決める（プレゼンテーションのビューの printMeasure。view/MarkdownPrint.tsx）
// 原文を探せる（base の検索）: 探すのはページの原文で、置き換えは変わった所だけの find・replace で送る（ほかの変更と重ならない。原文が空なら丸ごと）
export const MARKDOWN_PRESENTATION = kit.definePresentation({
  id: "markdown",
  paper: false,
  search: {
    textOf: page => ("text" in page && typeof page.text === "string" ? page.text : ""),
    edit: (_page, before, after) => {
      const edit = sourceEdit(before, after, before)
      return edit.kind === "send" ? edit.fields : { text: after }
    },
  },
})

// ソースのペインのテキストFormが名乗るキーの範囲（その中で押したキーは、この範囲だけで引く）
export const SOURCE_KEY_SCOPE = kit.defineKeyScope({ id: "source", title: "Source", commandsFrom: "stage" })

// ビューが開く右クリックのメニュー: ペインのタブ（右クリックしたペインを受け取る）（ui.tsx で core/catalog.ts に書き足す）
export const PANE_CONTEXT = kit.name("pane-context")

export const MARKDOWN = kit.definePageType({
  id: "markdown",
  version: 1,
  title: "Markdown",
  duplicatesPages: true, // ページの中の物は id を指す項目を持たないので、ページを複製できる
  grouping: "none",
  pageFieldsInput, // 直すときは、原文を丸ごとか、1 か所だけ置き換えて受ける
  grow: { always: { up: false, down: true, left: false, right: false } }, // いつも可変ページで、下へ増やす（base の拡張ポイント）
  paper: {
    allowed: PAPER_IDS,
    default: "@matomezu/base:a4",
    orientation: "portrait",
  },
  fields: { text: z.string().describe("The page's document, in Markdown").optional() }, // 無ければ空の文書
  items: { allowed: [] },
  actions: {},
  theme: "@matomezu/base:standard",
  themeTypes: [DOCUMENT_THEME_TYPE], // 使えるテーマのテーマタイプ
  presentation: MARKDOWN_PRESENTATION.id,
  tokens: MARKDOWN_TOKENS, // 描いた文書の見た目（tokens.ts）
  settings: [PAGE_THEME.id, PAGE_PAPER_COLOR.id],
})

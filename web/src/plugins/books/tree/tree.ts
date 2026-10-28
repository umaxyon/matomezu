// ツリーのブック: ページごとに紙を置き、ページのフィールド root（根）から伸びる木を、自分の見せ方（tree）で紙に描く。紙に置けるアイテムは無い。
// 伸びる向きと節の大きさの選び方は、ブックとページの設定の項目（grow.ts・size.ts）。新しいページは自分のダイアログで作る（ページ名・伸びる向き・根のキャプション）。道具は自分の組（tools.ts。編集とハンド）。
// 見た目（テーマと紙の色）は base の設定の項目で変えられる
import { z } from "zod"
import { BOOK_PAPER_COLOR, BOOK_THEME, PAPER_IDS } from "../../base"
import { treeFits } from "./fit"
import { kit } from "./kit"
import { TreeRootSchema } from "./node"
import { pageFieldsInput } from "./page-fields"
import { TREE_TOOLS } from "./tools"

// ツリーのキーの範囲（ツリーの見せ方で描いている間に探す）
export const TREE_KEYS_SCOPE = kit.name("tree")

// ツリーの見せ方: 紙の上に、根から伸びる木を描く。カレントのステージがこれで描いている間は、ツリーのキーの範囲を探す
export const TREE_PRESENTATION = kit.definePresentation({ id: "tree", keyScope: TREE_KEYS_SCOPE })

// ツリーのページを作るダイアログ（ページ名・伸びる向き・根のキャプション）
export const NEW_TREE_PAGE_DIALOG = kit.defineDialog({ id: "page-new" })

// ツリーのビューが開く右クリックのメニュー: 紙の画面（ui.tsx で core/catalog.ts に書き足す）
export const TREE_CONTEXT = kit.name("tree-context")

// 節の右クリックのメニュー（右クリックした節を選んでから開く。ui.tsx で core/catalog.ts に書き足す）
export const NODE_CONTEXT = kit.name("node-context")

// 子の節の大きさの選び方を変えるダイアログ（開いたステージのブックの、ページ page の節 node）
export const NODE_SIZE_DIALOG = kit.defineDialogWith<{ page: string; node: string }>()({ id: "node-size-edit" })

export const TREE = kit.defineBookType({
  id: "tree",
  version: 1,
  title: "Tree",
  schema: z.strictObject({ id: z.string().min(1) }),
  single: false,
  create: init => ({ ...init, pages: [] }),
  addPagesFromTabs: true,
  pageFieldsInput, // 根は作るときに子ごと受けて id を振り、直すときは根のキャプションと本文だけ
  // 木が紙に入らないページは問題（base のページ・ブックのアクションは書かない）
  pageProblem: (catalog, page, setting) =>
    treeFits(catalog, page, setting) ? null : { message: kit.message("Does not fit on the paper") },
  pages: {
    paper: { allowed: PAPER_IDS, default: "@matomezu/base:a4", orientation: "landscape", perPage: true },
    fields: { root: TreeRootSchema },
    dialogs: { add: NEW_TREE_PAGE_DIALOG.id },
  },
  items: { allowed: [], defaults: [] },
  actions: {}, // 使うアクションは、見せ方・ページについて来る
  theme: "@matomezu/base:standard",
  presentation: TREE_PRESENTATION.id,
  tokens: [
    { id: "tree-node-fill", fallback: "fill" },
    { id: "tree-node-line", value: "#cdcdd6" }, // 節の枠線（標準は淡い灰色。テーマが上書きする）
    { id: "tree-node-text", fallback: "text" },
    { id: "tree-node-radius", value: "6px" }, // 節の角の丸み
    { id: "tree-line", fallback: "line" }, // 親から子への線
  ],
  tools: TREE_TOOLS.id,
  settings: {
    book: [BOOK_THEME.id, BOOK_PAPER_COLOR.id, kit.name("grow"), kit.name("node-size")],
    page: [kit.name("grow"), kit.name("node-size")],
  },
})

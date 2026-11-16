// ツリーのブック: ページごとに紙を置き、ページのフィールド root（根）から伸びる木を、自分の見せ方（tree）で紙に描く。紙に置けるアイテムは無い。
// 伸びる向き・節の大きさの選び方・節の形・線の形は、ブックとページの設定の項目（grow.ts・size.ts・shape.ts・line-shape.ts）。新しいページを作るダイアログと、ページの設定のダイアログ（根のダイアログを兼ねる）は自分の物を名指す。道具は自分の組（tools.ts。編集とハンド）。
// 見た目（テーマと紙の色）と文字の色は base の設定の項目で変えられる。根の本文は太字と文字の色で装飾できる
import type { PageSettingsArgs } from "../../../plugin-api"
import {
  BACKGROUND_PRINT,
  DIAGRAM_THEME_TYPE,
  PAGE_PAPER_COLOR,
  PAGE_TEXT_COLORS,
  PAGE_THEME,
  PAPER_IDS,
} from "../../base"
import { nodeOf } from "./edit"
import { treeFits } from "./fit"
import { GROW, growSidesOf } from "./grow"
import { kit } from "./kit"
import { treeMinimap } from "./minimap"
import { TreeRootSchema, treeRootOf } from "./node"
import { pageFieldsInput } from "./page-fields"
import { laidOrigin, laidPage, treePrintSheets } from "./print"
import { TREE_TOOLS } from "./tools"

// ツリーのキーの範囲（ツリーの見せ方で描いている間に探す）
// 背景に置く形（ページの slide。背景編集モードで置く。スライドのアイテム）
const BACKGROUND_ITEMS = [
  "@matomezu/slide:slide-text",
  "@matomezu/slide:slide-free-line",
  "@matomezu/slide:slide-line",
  "@matomezu/slide:slide-ellipse",
] as const

export const TREE_KEY_SCOPE = kit.defineKeyScope({ id: "tree", title: "Tree" })
export const TREE_KEYS_SCOPE = TREE_KEY_SCOPE.id

// ツリーの見せ方: 紙の上に、根から伸びる木を描く。カレントのステージがこれで描いている間は、ツリーのキーの範囲を探す
export const TREE_PRESENTATION = kit.definePresentation({
  id: "tree",
  keyScope: TREE_KEYS_SCOPE,
  minimap: treeMinimap, // ミニマップには、節を四角で、線を両端を結ぶ線で描く
  printSheets: treePrintSheets, // 印刷区画は、木を並べて節が入るだけ
})

// ツリーのページの設定のダイアログ（根のダイアログを兼ねる。ページ名・伸びる向き・節の大きさ・根のキャプションと本文と、本文を描くか）
export const TREE_PAGE_SETTINGS_DIALOG = kit.defineDialogWith<PageSettingsArgs>()({
  id: "page-settings",
  edits: a => [a.page],
})

// ツリーのページを作るダイアログ（ページ名・伸びる向き・根のキャプション）
export const NEW_TREE_PAGE_DIALOG = kit.defineDialog({ id: "page-new" })

// ツリーのビューが開く右クリックのメニュー: 紙の画面（ui.tsx で core/catalog.ts に書き足す）
export const TREE_CONTEXT = kit.name("tree-context")

// 節の右クリックのメニュー（右クリックした節を選んでから開く。ui.tsx で core/catalog.ts に書き足す）
export const NODE_CONTEXT = kit.name("node-context")

// 子の節の大きさの選び方を変えるダイアログ（開いたステージのブックの、ページ page の節 node）
export const NODE_SIZE_DIALOG = kit.defineDialogWith<{ page: string; node: string }>()({
  id: "node-size-edit",
  edits: a => [a.node],
})

// 節の塗りのテーマキー（無ければテーマの塗り。節の色を選ぶときの「なし」の色）
export const NODE_FILL = { id: kit.name("tree-node-fill"), fallback: "fill" } as const

export const TREE = kit.definePageType({
  id: "tree",
  version: 1,
  title: "Tree",
  grouping: "none",
  pageFieldsInput, // 根は作るときに子ごと受けて id を振り、直すときは根のキャプション・本文・本文を描くか・色だけ
  // 木が紙に入らないページは問題（base のページ・ブックのアクションは書かない）
  pageProblem: (catalog, page, setting, grow) =>
    treeFits(catalog, page, setting, grow) ? null : { message: kit.message("Does not fit on the paper") },
  // 可変ページは、根のある側を固定して残りの向きへ増やす（中央なら 4 つとも。base の拡張ポイント）
  grow: { sides: setting => growSidesOf(setting(GROW)) },
  // 左（上）へ増やすとき、木全体を右・下へずらした印刷区画の数（ページの slide の形も、同じだけずらして描く。base の拡張ポイント）
  contentOrigin: (catalog, page, setting, grow) => laidOrigin(laidPage(catalog, page, { setting, grow })),
  // 節の名前はキャプション（base の labelOf）
  labelOf: (page, id) => {
    const root = treeRootOf(page)
    return (root?.id === id ? root.caption : root && nodeOf(root, id)?.caption) ?? ""
  },
  paper: {
    allowed: PAPER_IDS,
    default: "@matomezu/base:a4",
    orientation: "landscape",
  },
  fields: { root: TreeRootSchema },
  dialogs: { add: NEW_TREE_PAGE_DIALOG.id, settings: TREE_PAGE_SETTINGS_DIALOG.id },
  items: { allowed: [] },
  slide: { allowed: BACKGROUND_ITEMS, background: true },
  actions: {}, // 使うアクションは、見せ方・ページについて来る
  theme: "@matomezu/base:standard",
  themeTypes: [DIAGRAM_THEME_TYPE], // 使えるテーマのテーマタイプ
  presentation: TREE_PRESENTATION.id,
  tokens: [
    NODE_FILL,
    { id: "tree-node-line", value: "#cdcdd6", themeValues: { "@matomezu/base:matomezu": "#e3dbd2" } }, // 節の枠線（標準は淡い灰色。テーマごとの値は themeValues）
    { id: "tree-node-text", fallback: "text" },
    { id: "tree-node-radius", value: "6px", shades: "one" }, // 節の角の丸み
    { id: "tree-line", fallback: "line" }, // 親から子への線
  ],
  tools: TREE_TOOLS.id,
  settings: [
    PAGE_THEME.id,
    PAGE_PAPER_COLOR.id,
    kit.name("grow"),
    kit.name("node-size"),
    kit.name("node-shape"),
    kit.name("line-shape"),
    PAGE_TEXT_COLORS.id,
    BACKGROUND_PRINT.id,
  ],
})

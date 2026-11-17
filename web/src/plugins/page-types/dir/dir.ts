// ディレクトリ構成図のブック: ページごとに紙を置き、ページのフィールド root（根のフォルダ）から下の中身を、自分のプレゼンテーション（dir）で上から下へ並べて描く。紙に置けるアイテムは無い。
// 新しいページを作るダイアログは自分の物（根のフォルダの名前を聞く）、ページの設定のダイアログは base の物（ページ名・削除と、説明の見せ方の設定の項目）。道具は自分の組（tools.ts。鉛筆とハンド）。
// 見た目（テーマと紙の色）と文字の色は base の設定の項目で変えられる。名前は太字と文字の色で装飾できる
import {
  BACKGROUND_PRINT,
  DIAGRAM_THEME_TYPE,
  PAGE_PAPER_COLOR,
  PAGE_TEXT_COLORS,
  PAGE_THEME,
  PAPER_IDS,
} from "../../base"
import { entryOf } from "./edit"
import { DirFolderSchema, dirRootOf } from "./entry"
import { dirFits } from "./fit"
import { kit } from "./kit"
import { dirMinimap } from "./minimap"
import { pageFieldsInput } from "./page-fields"
import { dirPrintSheets } from "./print"
import { DIR_TOOLS } from "./tools"

// ディレクトリ構成図のキーの範囲（このプレゼンテーションで描いている間に探す）
// 背景に置く形（ページの slide。背景編集モードで置く。スライドのアイテム）
const BACKGROUND_ITEMS = [
  "@matomezu/slide:slide-text",
  "@matomezu/slide:slide-free-line",
  "@matomezu/slide:slide-line",
  "@matomezu/slide:slide-ellipse",
] as const

export const DIR_KEY_SCOPE = kit.defineKeyScope({ id: "dir", title: "Directory" })
export const DIR_KEYS_SCOPE = DIR_KEY_SCOPE.id

// ディレクトリ構成図のプレゼンテーション: 紙の上に、根のフォルダから下の中身を並べて描く。カレントのステージがこれで描いている間は、自分のキーの範囲を探す
export const DIR_PRESENTATION = kit.definePresentation({
  id: "dir",
  keyScope: DIR_KEYS_SCOPE,
  minimap: dirMinimap, // ミニマップには、行を四角で、罫線を線で描く
  printSheets: dirPrintSheets, // 印刷区画は、行と説明が入るだけ
})

// ディレクトリ構成図のページを作るダイアログ（ページ名・根のフォルダの名前）
export const NEW_DIR_PAGE_DIALOG = kit.defineDialog({ id: "page-new" })

// ビューが開く右クリックのメニュー: 紙の画面と、行（右クリックした行を選んでから開く）（ui.tsx で core/catalog.ts に書き足す）
export const DIR_CONTEXT = kit.name("dir-context")
export const ENTRY_CONTEXT = kit.name("entry-context")

// ノード（中身。根も）の設定のダイアログ（開いたステージのブックの、ページ page の中身 entry の名前・説明・色）
export const ENTRY_SETTINGS_DIALOG = kit.defineDialogWith<{ page: string; entry: string }>()({
  id: "entry-settings",
  edits: a => [a.entry],
})

export const DIR = kit.definePageType({
  id: "dir",
  version: 1,
  title: "Directory",
  duplicatesPages: true, // ページの中の物は id を指す項目を持たないので、ページを複製できる
  grouping: "none",
  pageFieldsInput, // 根は作るときに中身ごと受けて id を振る。直すときは受けない（中身はディレクトリ構成図のアクションで替える）
  // 行が紙に入らないページは問題
  pageProblem: (catalog, page, _setting, grow) =>
    dirFits(catalog, page, grow) ? null : { message: kit.message("Does not fit on the paper") },
  grow: { sides: () => ({ up: false, down: true, left: false, right: true }) }, // 可変ページは、根のある左上を固定して右と下へ増やす（base の拡張ポイント）
  // 行の名前は、ファイルやフォルダの名前（base の labelOf）
  labelOf: (page, id) => {
    const root = dirRootOf(page)
    return (root && entryOf(root, id)?.name) ?? ""
  },
  paper: {
    allowed: PAPER_IDS,
    default: "@matomezu/base:a4",
    orientation: "portrait",
  },
  fields: { root: DirFolderSchema },
  dialogs: { add: NEW_DIR_PAGE_DIALOG.id },
  items: { allowed: [] },
  slide: { allowed: BACKGROUND_ITEMS, background: true },
  actions: {}, // 使うアクションは、プレゼンテーションについて来る
  theme: "@matomezu/base:standard",
  themeTypes: [DIAGRAM_THEME_TYPE], // 使えるテーマのテーマタイプ
  presentation: DIR_PRESENTATION.id,
  tokens: [
    { id: "dir-text", fallback: "text" }, // 名前の字
    { id: "dir-line", fallback: "line" }, // 罫線
  ],
  tools: DIR_TOOLS.id,
  settings: [PAGE_THEME.id, PAGE_PAPER_COLOR.id, PAGE_TEXT_COLORS.id, kit.name("notes"), BACKGROUND_PRINT.id], // notes は説明の見せ方（notes.ts）
})

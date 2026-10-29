// ディレクトリ構成図のブック: ページごとに紙を置き、ページのフィールド root（根のフォルダ）から下の中身を、自分の見せ方（dir）で上から下へ並べて描く。紙に置けるアイテムは無い。
// 新しいページを作るダイアログは自分の物（根のフォルダの名前を聞く）、ページの設定のダイアログは base の物（ページ名・削除と、説明の見せ方の設定の項目）。道具は自分の組（tools.ts。鉛筆とハンド）。
// 見た目（テーマと紙の色）と文字の色は base の設定の項目で変えられる。名前は太字と文字の色で装飾できる
import { z } from "zod"
import { BOOK_PAPER_COLOR, BOOK_TEXT_COLORS, BOOK_THEME, PAPER_IDS } from "../../base"
import { DirFolderSchema } from "./entry"
import { dirFits } from "./fit"
import { kit } from "./kit"
import { dirMinimap } from "./minimap"
import { pageFieldsInput } from "./page-fields"
import { DIR_TOOLS } from "./tools"

// ディレクトリ構成図のキーの範囲（この見せ方で描いている間に探す）
export const DIR_KEYS_SCOPE = kit.name("dir")

// ディレクトリ構成図の見せ方: 紙の上に、根のフォルダから下の中身を並べて描く。カレントのステージがこれで描いている間は、自分のキーの範囲を探す
export const DIR_PRESENTATION = kit.definePresentation({ id: "dir", keyScope: DIR_KEYS_SCOPE })

// ディレクトリ構成図のページを作るダイアログ（ページ名・根のフォルダの名前）
export const NEW_DIR_PAGE_DIALOG = kit.defineDialog({ id: "page-new" })

// ビューが開く右クリックのメニュー: 紙の画面と、行（右クリックした行を選んでから開く）（ui.tsx で core/catalog.ts に書き足す）
export const DIR_CONTEXT = kit.name("dir-context")
export const ENTRY_CONTEXT = kit.name("entry-context")

// ノード（中身。根も）の設定のダイアログ（開いたステージのブックの、ページ page の中身 entry の名前・説明・色）
export const ENTRY_SETTINGS_DIALOG = kit.defineDialogWith<{ page: string; entry: string }>()({ id: "entry-settings" })

// 中身の色（無ければテーマの色）のテーマキー
export const FOLDER_COLOR = { id: "dir-folder", value: "#d9a441" } as const // フォルダのアイコン（標準は黄土色。テーマが上書きする）
export const FILE_COLOR = { id: "dir-file", value: "#8a8f9c" } as const // ファイルのアイコン（標準は灰色）

export const DIR = kit.defineBookType({
  id: "dir",
  version: 1,
  title: "Directory",
  schema: z.strictObject({ id: z.string().min(1) }),
  single: false,
  create: init => ({ ...init, pages: [] }),
  addPagesFromTabs: true,
  pageFieldsInput, // 根は作るときに中身ごと受けて id を振る。直すときは受けない（中身はディレクトリ構成図のアクションで替える）
  // 行が紙に入らないページは問題
  pageProblem: (catalog, page) =>
    dirFits(catalog, page) ? null : { message: kit.message("Does not fit on the paper") },
  minimap: dirMinimap, // ミニマップには、行を四角で、罫線を線で描く
  pages: {
    paper: { allowed: PAPER_IDS, default: "@matomezu/base:a4", orientation: "portrait", perPage: true },
    fields: { root: DirFolderSchema },
    dialogs: { add: NEW_DIR_PAGE_DIALOG.id },
  },
  items: { allowed: [], defaults: [] },
  actions: {}, // 使うアクションは、見せ方について来る
  theme: "@matomezu/base:standard",
  presentation: DIR_PRESENTATION.id,
  tokens: [
    FOLDER_COLOR,
    FILE_COLOR,
    { id: "dir-text", fallback: "text" }, // 名前の字
    { id: "dir-line", fallback: "line" }, // 罫線
  ],
  tools: DIR_TOOLS.id,
  settings: {
    book: [BOOK_THEME.id, BOOK_PAPER_COLOR.id, BOOK_TEXT_COLORS.id],
    page: [kit.name("notes-shown"), kit.name("note-dots"), kit.name("note-divider")], // 説明の見せ方（notes.ts）
  },
})

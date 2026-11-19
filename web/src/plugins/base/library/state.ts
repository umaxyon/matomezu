// 書庫の画面のプラグイン状態（描いているスクリーン 1 枚ごと）
import { z } from "zod"
import { kit } from "../kit"
import { openedFolderOf, shownFoldersOf, unfoldedOf } from "./outline"

// 開いているフォルダの id（右の枠に中身を出しているフォルダ）。画面の場所に入り、替えるたびにブラウザの履歴に積む（値が無ければ書庫ホーム）
export const LIBRARY_FOLDER = kit.definePluginState({
  id: "library-folder",
  scope: "screen",
  schema: z.string().min(1),
  address: "push",
})

// 選んでいる行の id（読み直すと消える。画面の場所には入れない）
export const LIBRARY_PICKED = kit.definePluginStateOf<string>()({ id: "library-picked", scope: "screen" })

// 検索している言葉（「検索」を押したときの入力Formの中身。読み直すと消える。値が無ければ、検索していない）
export const LIBRARY_QUERY = kit.definePluginStateOf<string>()({ id: "library-query", scope: "screen" })

// 右の枠の中身が 1 行に並べている列の数（ビューが描いた後に測り、窓や中身が変わったら測り直す。値が無ければ 1 列と見る）。
// 右の枠の上下の矢印のコマンド library-pick-move が、列の数だけ前・後ろの行を選ぶ
export const LIBRARY_COLUMNS = kit.definePluginStateOf<number>()({ id: "library-columns", scope: "screen" })

// ツリーで中を出しているフォルダの id（読み直すと消える。値が無ければ、書庫ホームだけ）
export const LIBRARY_UNFOLDED = kit.definePluginStateOf<readonly string[]>()({
  id: "library-unfolded",
  scope: "screen",
})

// 書庫の画面（LibraryView）の書庫アピアランス: 右の枠で開いているフォルダと、ツリーで中を出しているフォルダを見せている。
// LibraryView を置くスクリーンの定義が、libraryAppearances で名指す
export const LIBRARY_APPEARANCE = kit.defineLibraryAppearance({
  id: "library",
  shownFolders: (folders, read) =>
    shownFoldersOf(folders, openedFolderOf(folders, read(LIBRARY_FOLDER)), unfoldedOf(read(LIBRARY_UNFOLDED))),
})

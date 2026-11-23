// 書庫の画面のプラグイン状態（描いているスクリーン 1 枚ごと。ツリーの幅と読めない物の知らせは窓ごと）
import { z } from "zod"
import { kit } from "../kit"
import { workdesksOf, workdesksReadsOf } from "../participant/workdesks"
import { openedFolderOf, shownFoldersOf, unfoldedOf } from "./outline"
import { TREE_MIN_WIDTH } from "./tree-width"

// 開いているフォルダの id（右の枠に中身を出しているフォルダ）。画面の場所に入り、替えるたびにブラウザの履歴に積む（値が無ければ書庫ホーム）
export const LIBRARY_FOLDER = kit.definePluginState({
  id: "library-folder",
  scope: "screen",
  schema: z.string().min(1),
  address: "push",
})

// 選んでいる行の id（読み直すと消える。画面の場所には入れない）
export const LIBRARY_PICKED = kit.definePluginStateOf<string>()({ id: "library-picked", scope: "screen" })

// 検索の結果の枠で選んでいる行の id（Enter・Mod+Enter で開く物。作業履歴の行は、ツリーへ移らないので、ツリーで今いる行でなくこれで開く）。
// 言葉を変えると外す。読み直すと消える
export const LIBRARY_FOUND_PICKED = kit.definePluginStateOf<string>()({ id: "library-found-picked", scope: "screen" })

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

// ツリーの幅（px。窓ごとに 1 つで、書庫を見せるどのスクリーンでも同じ幅。画面の場所に入るが履歴には積まない。値が無ければ既定の幅）
export const LIBRARY_TREE_WIDTH = kit.definePluginState({
  id: "library-tree-width",
  scope: "window",
  schema: z.number().int().min(TREE_MIN_WIDTH),
  address: "replace",
})

// 書庫の画面（LibraryView）の書庫アピアランス: 右の枠で開いているフォルダと、ツリーで中を出しているフォルダを見せている（作業机とその下の行は、実の物）。
// LibraryView を置くスクリーンの定義が、libraryAppearances で名指す
export const LIBRARY_APPEARANCE = kit.defineLibraryAppearance({
  id: "library",
  readsSubjects: workdesksReadsOf,
  shownFolders: (folders, read, records, catalog) => {
    const desks = workdesksOf(catalog, records, folders)
    return shownFoldersOf(
      folders,
      openedFolderOf(folders, read(LIBRARY_FOLDER), desks),
      unfoldedOf(read(LIBRARY_UNFOLDED)),
      desks,
    )
  },
})

// 読めない物が移った・戻ったときの知らせを閉じたか（窓ごと。読み直すと消える。値が無ければ、まだ閉じていない）。描き直しても、閉じた知らせは出さない
export const NOTICE_CLOSED = "closed"
export const UNREADABLE_NOTICE_CLOSED = kit.definePluginStateOf<typeof NOTICE_CLOSED>()({
  id: "unreadable-notice-closed",
  scope: "window",
})

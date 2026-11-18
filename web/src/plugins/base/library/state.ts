// 書庫の画面のプラグイン状態（描いているスクリーン 1 枚ごと）
import { z } from "zod"
import { kit } from "../kit"

// 開いているフォルダの id（右の枠に中身を出しているフォルダ）。画面の場所に入り、替えるたびにブラウザの履歴に積む（値が無ければ書庫ホーム）
export const LIBRARY_FOLDER = kit.definePluginState({
  id: "library-folder",
  scope: "screen",
  schema: z.string().min(1),
  address: "push",
})

// 選んでいる行の id（読み直すと消える。画面の場所には入れない）
export const LIBRARY_PICKED = kit.definePluginStateOf<string>()({ id: "library-picked", scope: "screen" })
